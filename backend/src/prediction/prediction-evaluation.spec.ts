import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { SetupQuality, TodayAction } from '../market/types/market-today';
import {
  buildPredictionDedupeKey,
  evaluatePrediction,
  isWithinEvaluationWindow,
} from './prediction-evaluation';
import type { PredictionRecord } from './types/prediction';
import { OutcomeClassification } from './types/prediction-outcome';

function prediction(
  overrides: Partial<PredictionRecord> = {},
): PredictionRecord {
  return {
    id: 'pred_test',
    generatedAt: '2026-08-09T20:30:00.000-04:00',
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

describe('prediction evaluation', () => {
  it('marks BUY as WIN when return is positive', () => {
    const outcome = evaluatePrediction({
      prediction: prediction({ recommendation: TodayAction.BUY }),
      evaluationPrice: 110,
      evaluatedAt: new Date('2026-08-12T16:00:00.000Z'),
    });

    expect(outcome.returnPercentage).toBe(10);
    expect(outcome.directionallyCorrect).toBe(true);
    expect(outcome.outcomeClassification).toBe(OutcomeClassification.WIN);
    expect(outcome.daysElapsed).toBeGreaterThanOrEqual(1);
  });

  it('marks SELL as WIN when return is negative', () => {
    const outcome = evaluatePrediction({
      prediction: prediction({
        recommendation: TodayAction.SELL,
        entryPrice: 100,
      }),
      evaluationPrice: 90,
      evaluatedAt: new Date('2026-08-12T16:00:00.000Z'),
    });

    expect(outcome.returnPercentage).toBe(-10);
    expect(outcome.directionallyCorrect).toBe(true);
    expect(outcome.outcomeClassification).toBe(OutcomeClassification.WIN);
  });

  it('marks SELL as LOSS when return is positive', () => {
    const outcome = evaluatePrediction({
      prediction: prediction({ recommendation: TodayAction.SELL }),
      evaluationPrice: 105,
      evaluatedAt: new Date('2026-08-12T16:00:00.000Z'),
    });

    expect(outcome.directionallyCorrect).toBe(false);
    expect(outcome.outcomeClassification).toBe(OutcomeClassification.LOSS);
  });

  it('records WATCH/WAIT returns as OBSERVED without win/loss', () => {
    for (const recommendation of [TodayAction.WATCH, TodayAction.WAIT]) {
      const outcome = evaluatePrediction({
        prediction: prediction({ recommendation }),
        evaluationPrice: 108,
        evaluatedAt: new Date('2026-08-12T16:00:00.000Z'),
      });

      expect(outcome.returnPercentage).toBe(8);
      expect(outcome.directionallyCorrect).toBeNull();
      expect(outcome.outcomeClassification).toBe(
        OutcomeClassification.OBSERVED,
      );
    }
  });

  it('handles missing or invalid price data', () => {
    const missingEntry = evaluatePrediction({
      prediction: prediction({ entryPrice: null }),
      evaluationPrice: 100,
    });
    expect(missingEntry.outcomeClassification).toBe(
      OutcomeClassification.INSUFFICIENT_DATA,
    );
    expect(missingEntry.directionallyCorrect).toBeNull();

    const badEval = evaluatePrediction({
      prediction: prediction(),
      evaluationPrice: -1,
    });
    expect(badEval.outcomeClassification).toBe(
      OutcomeClassification.INSUFFICIENT_DATA,
    );
  });

  it('respects evaluation window boundaries', () => {
    const record = prediction({
      generatedAt: '2026-08-09T20:30:00.000-04:00',
      evaluationWindow: { minDays: 1, maxDays: 5 },
    });

    expect(
      isWithinEvaluationWindow(record, new Date('2026-08-09T20:30:00.000-04:00')),
    ).toBe(false);
    expect(
      isWithinEvaluationWindow(record, new Date('2026-08-10T20:30:00.000-04:00')),
    ).toBe(true);
    expect(
      isWithinEvaluationWindow(record, new Date('2026-08-14T20:30:00.000-04:00')),
    ).toBe(true);
    expect(
      isWithinEvaluationWindow(record, new Date('2026-08-15T20:30:00.000-04:00')),
    ).toBe(false);
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
      generatedAt: '2026-08-10T00:30:00.000Z', // still Aug 9 in NY
      recommendation: TodayAction.WATCH,
      signalScore: 74,
      catalystScore: 62,
    });

    expect(a).toBe(b);
  });
});
