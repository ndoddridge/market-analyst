import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { SetupQuality, TodayAction } from '../market/types/market-today';
import {
  buildPredictionDedupeKey,
  evaluatePrediction,
  isWithinEvaluationWindow,
} from './prediction-evaluation';
import type { PredictionRecord } from './types/prediction';
import {
  EvaluationStatus,
  OutcomeClassification,
} from './types/prediction-outcome';

function prediction(
  overrides: Partial<PredictionRecord> = {},
): PredictionRecord {
  return {
    id: 'pred_test',
    generatedAt: '2026-07-20T16:00:00.000-04:00',
    profile: AnalysisProfile.SHORT_TERM,
    ticker: 'AAPL',
    recommendation: TodayAction.BUY,
    signalScore: 80,
    catalystScore: 70,
    setupQuality: SetupQuality.STRONG,
    catalyst: null,
    entryPrice: 100,
    entryCurrency: 'USD',
    evaluationWindow: { minDays: 1, maxDays: 5 },
    reason: 'test',
    outcome: null,
    ...overrides,
  };
}

describe('prediction evaluation engine', () => {
  it('marks BUY positive return as directionally correct WIN', () => {
    const outcome = evaluatePrediction({
      prediction: prediction({ recommendation: TodayAction.BUY }),
      observation: {
        price: 110,
        observedAt: new Date('2026-07-23T16:00:00.000-04:00'),
      },
    });

    expect(outcome.status).toBe(EvaluationStatus.EVALUATED);
    expect(outcome.returnPercentage).toBe(10);
    expect(outcome.directionallyCorrect).toBe(true);
    expect(outcome.outcomeClassification).toBe(OutcomeClassification.WIN);
  });

  it('marks BUY negative return as incorrect LOSS', () => {
    const outcome = evaluatePrediction({
      prediction: prediction({ recommendation: TodayAction.BUY }),
      observation: {
        price: 90,
        observedAt: new Date('2026-07-23T16:00:00.000-04:00'),
      },
    });

    expect(outcome.status).toBe(EvaluationStatus.EVALUATED);
    expect(outcome.directionallyCorrect).toBe(false);
    expect(outcome.outcomeClassification).toBe(OutcomeClassification.LOSS);
  });

  it('marks SELL negative return as directionally correct WIN', () => {
    const outcome = evaluatePrediction({
      prediction: prediction({ recommendation: TodayAction.SELL }),
      observation: {
        price: 90,
        observedAt: new Date('2026-07-23T16:00:00.000-04:00'),
      },
    });

    expect(outcome.status).toBe(EvaluationStatus.EVALUATED);
    expect(outcome.directionallyCorrect).toBe(true);
    expect(outcome.outcomeClassification).toBe(OutcomeClassification.WIN);
  });

  it('marks SELL positive return as incorrect LOSS', () => {
    const outcome = evaluatePrediction({
      prediction: prediction({ recommendation: TodayAction.SELL }),
      observation: {
        price: 110,
        observedAt: new Date('2026-07-23T16:00:00.000-04:00'),
      },
    });

    expect(outcome.status).toBe(EvaluationStatus.EVALUATED);
    expect(outcome.directionallyCorrect).toBe(false);
    expect(outcome.outcomeClassification).toBe(OutcomeClassification.LOSS);
  });

  it('records WATCH/WAIT returns as OBSERVED without win/loss', () => {
    for (const recommendation of [TodayAction.WATCH, TodayAction.WAIT]) {
      const outcome = evaluatePrediction({
        prediction: prediction({ recommendation }),
        observation: {
          price: 108,
          observedAt: new Date('2026-07-23T16:00:00.000-04:00'),
        },
      });

      expect(outcome.status).toBe(EvaluationStatus.EVALUATED);
      expect(outcome.returnPercentage).toBe(8);
      expect(outcome.directionallyCorrect).toBeNull();
      expect(outcome.outcomeClassification).toBe(
        OutcomeClassification.OBSERVED,
      );
    }
  });

  it('treats zero return BUY/SELL as BREAKEVEN without directional flag', () => {
    const outcome = evaluatePrediction({
      prediction: prediction({ recommendation: TodayAction.BUY }),
      observation: {
        price: 100,
        observedAt: new Date('2026-07-23T16:00:00.000-04:00'),
      },
    });

    expect(outcome.status).toBe(EvaluationStatus.EVALUATED);
    expect(outcome.returnPercentage).toBe(0);
    expect(outcome.directionallyCorrect).toBeNull();
    expect(outcome.outcomeClassification).toBe(OutcomeClassification.BREAKEVEN);
  });

  it('marks missing price data as UNAVAILABLE without fabricating prices', () => {
    const missingEntry = evaluatePrediction({
      prediction: prediction({ entryPrice: null }),
      observation: {
        price: 100,
        observedAt: new Date('2026-07-23T16:00:00.000-04:00'),
      },
    });
    expect(missingEntry.status).toBe(EvaluationStatus.UNAVAILABLE);
    expect(missingEntry.outcomeClassification).toBeNull();

    const missingEval = evaluatePrediction({
      prediction: prediction(),
      observation: {
        price: null,
        observedAt: new Date('2026-07-23T16:00:00.000-04:00'),
      },
    });
    expect(missingEval.status).toBe(EvaluationStatus.UNAVAILABLE);
  });

  it('marks evaluation before the minimum window as INVALID', () => {
    const outcome = evaluatePrediction({
      prediction: prediction({
        generatedAt: '2026-07-20T16:00:00.000-04:00',
        evaluationWindow: { minDays: 2, maxDays: 5 },
      }),
      observation: {
        price: 110,
        observedAt: new Date('2026-07-21T16:00:00.000-04:00'), // 1 day elapsed
      },
    });

    expect(outcome.status).toBe(EvaluationStatus.INVALID);
    expect(outcome.outcomeClassification).toBeNull();
    expect(outcome.daysElapsed).toBe(1);
  });

  it('allows evaluation after the maximum window and still scores', () => {
    const record = prediction({
      generatedAt: '2026-07-20T16:00:00.000-04:00',
      evaluationWindow: { minDays: 1, maxDays: 5 },
    });

    expect(
      isWithinEvaluationWindow(
        record,
        new Date('2026-07-28T16:00:00.000-04:00'),
      ),
    ).toBe(false);

    const outcome = evaluatePrediction({
      prediction: record,
      observation: {
        price: 110,
        observedAt: new Date('2026-07-28T16:00:00.000-04:00'), // 8 days
      },
    });

    expect(outcome.status).toBe(EvaluationStatus.EVALUATED);
    expect(outcome.outcomeClassification).toBe(OutcomeClassification.WIN);
    expect(outcome.detail).toMatch(/after the max window/i);
  });

  it('builds stable dedupe keys for the same market day', () => {
    const a = buildPredictionDedupeKey({
      profile: AnalysisProfile.SHORT_TERM,
      ticker: 'aapl',
      generatedAt: '2026-08-09T20:30:00.000-04:00',
      recommendation: TodayAction.WATCH,
      signalScore: 74,
      catalystScore: 62,
    });
    const b = buildPredictionDedupeKey({
      profile: AnalysisProfile.SHORT_TERM,
      ticker: 'AAPL',
      generatedAt: '2026-08-10T00:30:00.000Z',
      recommendation: TodayAction.WATCH,
      signalScore: 74,
      catalystScore: 62,
    });

    expect(a).toBe(b);
  });
});
