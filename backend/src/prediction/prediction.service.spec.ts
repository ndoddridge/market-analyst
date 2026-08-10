import { AnalysisProfile } from '../analysis/types/analysis-profile';
import {
  CatalystType,
  MarketDirection,
  SetupQuality,
  TodayAction,
  type MarketTodayResult,
} from '../market/types/market-today';
import { InMemoryPredictionRepository } from './in-memory-prediction.repository';
import { evaluatePrediction } from './prediction-evaluation';
import { PredictionService } from './prediction.service';
import { OutcomeClassification } from './types/prediction-outcome';

describe('PredictionService', () => {
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

  it('persists a SHORT_TERM prediction with entry price and catalyst snapshot', async () => {
    const recorded = await service.recordFromToday(todayResult(), {
      evaluationWindow: { minDays: 1, maxDays: 5 },
    });

    expect(recorded).not.toBeNull();
    expect(recorded?.id).toMatch(/^pred_/);
    expect(recorded?.ticker).toBe('AAPL');
    expect(recorded?.recommendation).toBe(TodayAction.WATCH);
    expect(recorded?.signalScore).toBe(74);
    expect(recorded?.catalystScore).toBe(62);
    expect(recorded?.setupQuality).toBe(SetupQuality.MODERATE);
    expect(recorded?.entryPrice).toBe(200);
    expect(recorded?.catalyst?.headline).toContain('Apple CEO');
    expect(recorded?.evaluationWindow).toEqual({ minDays: 1, maxDays: 5 });
    expect(recorded?.outcome).toBeNull();

    const fetched = await service.getById(recorded!.id);
    expect(fetched).toEqual(recorded);
  });

  it('prevents duplicate records for the same prediction fingerprint', async () => {
    const first = await service.recordFromToday(todayResult());
    const second = await service.recordFromToday(todayResult());

    expect(second?.id).toBe(first?.id);
    const recent = await service.listRecent();
    expect(recent).toHaveLength(1);
  });

  it('does not record LONG_TERM results', async () => {
    const recorded = await service.recordFromToday(
      todayResult({
        profile: AnalysisProfile.LONG_TERM,
        decision: null,
      }),
    );
    expect(recorded).toBeNull();
    expect(await service.listRecent()).toHaveLength(0);
  });

  it('evaluates BUY outcomes and preserves the original prediction snapshot', async () => {
    marketService.getQuote.mockResolvedValue({
      symbol: 'NVDA',
      price: 100,
      currency: 'USD',
      timestamp: '2026-08-09T20:30:00.000Z',
      source: 'Yahoo Finance',
    });

    const recorded = await service.recordFromToday(
      todayResult({
        topOpportunity: {
          ticker: 'NVDA',
          recommendation: TodayAction.BUY,
          score: 90,
        },
        decision: {
          signalScore: 90,
          catalystScore: 85,
          setupQuality: SetupQuality.STRONG,
          reason: 'NVDA strong setup',
        },
      }),
    );

    const snapshot = {
      ticker: recorded!.ticker,
      recommendation: recorded!.recommendation,
      signalScore: recorded!.signalScore,
      catalystScore: recorded!.catalystScore,
      setupQuality: recorded!.setupQuality,
      entryPrice: recorded!.entryPrice,
      reason: recorded!.reason,
      generatedAt: recorded!.generatedAt,
    };

    marketService.getQuote.mockResolvedValue({
      symbol: 'NVDA',
      price: 112,
      currency: 'USD',
      timestamp: '2026-08-12T20:30:00.000Z',
      source: 'Yahoo Finance',
    });

    const evaluated = await service.evaluate(recorded!.id);

    expect(evaluated.outcome?.outcomeClassification).toBe(
      OutcomeClassification.WIN,
    );
    expect(evaluated.outcome?.directionallyCorrect).toBe(true);
    expect(evaluated.outcome?.returnPercentage).toBe(12);

    expect(evaluated.ticker).toBe(snapshot.ticker);
    expect(evaluated.recommendation).toBe(snapshot.recommendation);
    expect(evaluated.signalScore).toBe(snapshot.signalScore);
    expect(evaluated.catalystScore).toBe(snapshot.catalystScore);
    expect(evaluated.setupQuality).toBe(snapshot.setupQuality);
    expect(evaluated.entryPrice).toBe(snapshot.entryPrice);
    expect(evaluated.reason).toBe(snapshot.reason);
    expect(evaluated.generatedAt).toBe(snapshot.generatedAt);
  });

  it('evaluates SELL outcomes using negative returns as wins', async () => {
    const recorded = await repository.create({
      dedupeKey: 'sell-key',
      generatedAt: '2026-08-09T20:30:00.000-04:00',
      profile: AnalysisProfile.SHORT_TERM,
      ticker: 'AMD',
      recommendation: TodayAction.SELL,
      signalScore: 20,
      catalystScore: 0,
      setupQuality: SetupQuality.WEAK,
      catalyst: null,
      entryPrice: 150,
      entryCurrency: 'USD',
      evaluationWindow: { minDays: 1, maxDays: 5 },
      reason: 'AMD weakest',
    });

    marketService.getQuote.mockResolvedValue({
      symbol: 'AMD',
      price: 140,
      currency: 'USD',
      timestamp: '2026-08-12T20:30:00.000Z',
      source: 'Yahoo Finance',
    });

    const evaluated = await service.evaluate(recorded.id);
    expect(evaluated.outcome?.outcomeClassification).toBe(
      OutcomeClassification.WIN,
    );
    expect(evaluated.outcome?.directionallyCorrect).toBe(true);
  });

  it('evaluates WATCH/WAIT as OBSERVED without directional win/loss', async () => {
    const recorded = await service.recordFromToday(todayResult());
    marketService.getQuote.mockResolvedValue({
      symbol: 'AAPL',
      price: 210,
      currency: 'USD',
      timestamp: '2026-08-12T20:30:00.000Z',
      source: 'Yahoo Finance',
    });

    const evaluated = await service.evaluate(recorded!.id);
    expect(evaluated.outcome?.outcomeClassification).toBe(
      OutcomeClassification.OBSERVED,
    );
    expect(evaluated.outcome?.directionallyCorrect).toBeNull();
    expect(evaluated.outcome?.returnPercentage).toBe(5);
  });

  it('marks insufficient data when quotes are unavailable', async () => {
    marketService.getQuote.mockRejectedValue(new Error('quote failed'));
    const recorded = await service.recordFromToday(todayResult());
    expect(recorded?.entryPrice).toBeNull();

    marketService.getQuote.mockRejectedValue(new Error('quote failed'));
    const evaluated = await service.evaluate(recorded!.id);
    expect(evaluated.outcome?.outcomeClassification).toBe(
      OutcomeClassification.INSUFFICIENT_DATA,
    );
  });

  it('lists predictions by ticker for history-style inspection', async () => {
    await service.recordFromToday(todayResult());
    await service.recordFromToday(
      todayResult({
        topOpportunity: {
          ticker: 'MSFT',
          recommendation: TodayAction.WAIT,
          score: 50,
        },
        decision: {
          signalScore: 50,
          catalystScore: 0,
          setupQuality: SetupQuality.WEAK,
          reason: 'MSFT wait',
        },
        generatedAt: '2026-08-08T20:30:00.000-04:00',
      }),
    );

    const aapl = await service.listByTicker('AAPL');
    expect(aapl).toHaveLength(1);
    expect(aapl[0].ticker).toBe('AAPL');
  });

  it('exposes a developer inspect payload with pending/evaluated status', async () => {
    const recorded = await service.recordFromToday(todayResult());
    const inspect = await service.inspectRecent();

    expect(inspect.count).toBe(1);
    expect(inspect.predictions[0].id).toBe(recorded?.id);
    expect(inspect.predictions[0].outcomeStatus).toBe('PENDING');

    // WATCH/WAIT stay OBSERVED even at flat returns (not BUY/SELL scored).
    expect(
      evaluatePrediction({
        prediction: recorded!,
        evaluationPrice: 200,
      }).outcomeClassification,
    ).toBe(OutcomeClassification.OBSERVED);
  });
});
