import { AnalysisProfile } from '../analysis/types/analysis-profile';
import {
  CatalystType,
  MarketDirection,
  SetupQuality,
  TodayAction,
  type MarketTodayResult,
} from '../market/types/market-today';
import { InMemoryPredictionRepository } from './in-memory-prediction.repository';
import { seedHistoricalPredictionFixtures } from './prediction-fixtures';
import { buildPredictionScorecard } from './prediction-scorecard';
import { PredictionService } from './prediction.service';
import {
  EvaluationStatus,
  OutcomeClassification,
} from './types/prediction-outcome';

describe('PredictionService evaluation + scorecard', () => {
  const marketService = {
    getQuote: jest.fn(),
  };

  let repository: InMemoryPredictionRepository;
  let service: PredictionService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new InMemoryPredictionRepository();
    service = new PredictionService(repository, marketService as never);
    marketService.getQuote.mockResolvedValue({
      symbol: 'AAPL',
      price: 200,
      currency: 'USD',
      timestamp: '2026-08-09T20:30:00.000Z',
      source: 'Yahoo Finance',
    });
  });

  function todayResult(
    overrides: Partial<MarketTodayResult> = {},
  ): MarketTodayResult {
    return {
      profile: AnalysisProfile.SHORT_TERM,
      marketDirection: MarketDirection.BULLISH,
      topOpportunity: {
        ticker: 'AAPL',
        recommendation: TodayAction.WATCH,
        score: 74,
      },
      topRisk: {
        ticker: 'AMD',
        recommendation: TodayAction.SELL,
        score: 20,
      },
      catalyst: {
        type: CatalystType.NEWS,
        headline: 'Apple CEO succession update',
        ticker: 'AAPL',
        date: '2026-08-09T22:20:00.000Z',
        source: 'Yahoo Finance',
      },
      decision: {
        signalScore: 74,
        catalystScore: 62,
        setupQuality: SetupQuality.MODERATE,
        reason: 'AAPL leads on moderate near-term evidence.',
      },
      reason: 'AAPL leads on moderate near-term evidence.',
      summary: 'SHORT_TERM summary',
      generatedAt: '2026-08-09T20:30:00.000-04:00',
      predictionId: null,
      ...overrides,
    };
  }

  it('persists a SHORT_TERM prediction with entry price', async () => {
    const recorded = await service.recordFromToday(todayResult(), {
      evaluationWindow: { minDays: 1, maxDays: 5 },
    });

    expect(recorded?.entryPrice).toBe(200);
    expect(recorded?.outcome).toBeNull();
  });

  it('prevents duplicate records for the same prediction fingerprint', async () => {
    const first = await service.recordFromToday(todayResult());
    const second = await service.recordFromToday(todayResult());
    expect(second?.id).toBe(first?.id);
    expect(await service.listRecent()).toHaveLength(1);
  });

  it('does not record LONG_TERM results', async () => {
    const recorded = await service.recordFromToday(
      todayResult({
        profile: AnalysisProfile.LONG_TERM,
        decision: null,
      }),
    );
    expect(recorded).toBeNull();
  });

  it('evaluates with a supplied price/date deterministically and stays immutable', async () => {
    const recorded = await repository.create({
      dedupeKey: 'buy-pos',
      generatedAt: '2026-07-20T16:00:00.000-04:00',
      profile: AnalysisProfile.SHORT_TERM,
      ticker: 'NVDA',
      recommendation: TodayAction.BUY,
      signalScore: 90,
      catalystScore: 80,
      setupQuality: SetupQuality.STRONG,
      catalyst: null,
      entryPrice: 100,
      entryCurrency: 'USD',
      evaluationWindow: { minDays: 1, maxDays: 5 },
      reason: 'buy fixture',
    });

    const snapshot = {
      ticker: recorded.ticker,
      recommendation: recorded.recommendation,
      signalScore: recorded.signalScore,
      catalystScore: recorded.catalystScore,
      entryPrice: recorded.entryPrice,
      reason: recorded.reason,
      generatedAt: recorded.generatedAt,
    };

    const evaluated = await service.evaluate(recorded.id, {
      evaluationPrice: 112,
      evaluatedAt: '2026-07-24T16:00:00.000-04:00',
    });

    expect(evaluated.outcome?.status).toBe(EvaluationStatus.EVALUATED);
    expect(evaluated.outcome?.outcomeClassification).toBe(
      OutcomeClassification.WIN,
    );
    expect(evaluated.outcome?.returnPercentage).toBe(12);
    expect(evaluated.ticker).toBe(snapshot.ticker);
    expect(evaluated.recommendation).toBe(snapshot.recommendation);
    expect(evaluated.signalScore).toBe(snapshot.signalScore);
    expect(evaluated.catalystScore).toBe(snapshot.catalystScore);
    expect(evaluated.entryPrice).toBe(snapshot.entryPrice);
    expect(evaluated.reason).toBe(snapshot.reason);
    expect(evaluated.generatedAt).toBe(snapshot.generatedAt);
  });

  it('is idempotent: duplicate evaluation does not mutate the outcome', async () => {
    const recorded = await repository.create({
      dedupeKey: 'idem',
      generatedAt: '2026-07-20T16:00:00.000-04:00',
      profile: AnalysisProfile.SHORT_TERM,
      ticker: 'MSFT',
      recommendation: TodayAction.BUY,
      signalScore: 80,
      catalystScore: 50,
      setupQuality: SetupQuality.MODERATE,
      catalyst: null,
      entryPrice: 100,
      entryCurrency: 'USD',
      evaluationWindow: { minDays: 1, maxDays: 5 },
      reason: 'idem',
    });

    const first = await service.evaluate(recorded.id, {
      evaluationPrice: 105,
      evaluatedAt: '2026-07-24T16:00:00.000-04:00',
    });
    const second = await service.evaluate(recorded.id, {
      evaluationPrice: 200,
      evaluatedAt: '2026-07-28T16:00:00.000-04:00',
    });

    expect(second.outcome).toEqual(first.outcome);
    expect(second.outcome?.returnPercentage).toBe(5);
  });

  it('allows retry after UNAVAILABLE, but locks once EVALUATED', async () => {
    const recorded = await repository.create({
      dedupeKey: 'retry-unavail',
      generatedAt: '2026-07-20T16:00:00.000-04:00',
      profile: AnalysisProfile.SHORT_TERM,
      ticker: 'AMD',
      recommendation: TodayAction.SELL,
      signalScore: 20,
      catalystScore: 0,
      setupQuality: SetupQuality.WEAK,
      catalyst: null,
      entryPrice: 100,
      entryCurrency: 'USD',
      evaluationWindow: { minDays: 1, maxDays: 5 },
      reason: 'retry',
    });

    marketService.getQuote.mockRejectedValue(new Error('down'));
    const unavailable = await service.evaluate(recorded.id, {
      evaluatedAt: '2026-07-24T16:00:00.000-04:00',
    });
    expect(unavailable.outcome?.status).toBe(EvaluationStatus.UNAVAILABLE);

    const recovered = await service.evaluate(recorded.id, {
      evaluationPrice: 90,
      evaluatedAt: '2026-07-24T16:00:00.000-04:00',
    });
    expect(recovered.outcome?.status).toBe(EvaluationStatus.EVALUATED);
    expect(recovered.outcome?.returnPercentage).toBe(-10);

    const locked = await service.evaluate(recorded.id, {
      evaluationPrice: 50,
      evaluatedAt: '2026-07-25T16:00:00.000-04:00',
    });
    expect(locked.outcome).toEqual(recovered.outcome);
  });

  it('marks UNAVAILABLE when live quote is missing and no price is supplied', async () => {
    marketService.getQuote.mockRejectedValue(new Error('down'));
    const recorded = await service.recordFromToday(
      todayResult({
        generatedAt: '2026-07-20T16:00:00.000-04:00',
      }),
    );

    const evaluated = await service.evaluate(recorded!.id, {
      evaluatedAt: '2026-07-24T16:00:00.000-04:00',
    });
    expect(evaluated.outcome?.status).toBe(EvaluationStatus.UNAVAILABLE);
  });

  it('seeds historical fixtures and builds a usable scorecard', async () => {
    const seeded = await seedHistoricalPredictionFixtures(repository);
    expect(seeded).toBeGreaterThan(0);

    // Second seed is idempotent.
    expect(await seedHistoricalPredictionFixtures(repository)).toBe(0);

    const scorecard = await service.getHistoryScorecard();

    expect(scorecard.totalPredictions).toBeGreaterThanOrEqual(7);
    expect(scorecard.evaluatedPredictions).toBeGreaterThanOrEqual(7);
    expect(scorecard.buyCount).toBeGreaterThan(0);
    expect(scorecard.sellCount).toBeGreaterThan(0);
    expect(scorecard.watchWaitCount).toBeGreaterThan(0);
    expect(scorecard.directionalAccuracy).not.toBeNull();
    expect(scorecard.averageReturn).not.toBeNull();
    expect(scorecard.byTicker.length).toBeGreaterThan(0);
    expect(scorecard.bySetupQuality.length).toBeGreaterThan(0);
    expect(scorecard.byScoreBucket.map((bucket) => bucket.key)).toEqual(
      expect.arrayContaining(['0-49', '50-69', '70-84', '85-100']),
    );

    const rebuilt = buildPredictionScorecard(await repository.listRecent(100));
    expect(rebuilt.totalPredictions).toBe(scorecard.totalPredictions);
  });
});
