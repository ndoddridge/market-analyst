import { AnalysisProfile } from '../analysis/types/analysis-profile';
import {
  CatalystType,
  SetupQuality,
  TodayAction,
} from '../market/types/market-today';
import { evaluatePrediction } from './prediction-evaluation';
import type { PredictionRepository } from './prediction.repository';
import type { CreatePredictionInput } from './types/prediction';
import { EvaluationStatus } from './types/prediction-outcome';

export type HistoricalPredictionFixture = {
  dedupeKey: string;
  snapshot: Omit<CreatePredictionInput, 'dedupeKey'>;
  evaluationPrice: number;
  evaluatedAt: string;
};

/**
 * Deterministic historical-style predictions for scorecard/evaluation demos.
 * Dates are in the past so windows are already complete.
 */
export const HISTORICAL_PREDICTION_FIXTURES: HistoricalPredictionFixture[] = [
  {
    dedupeKey: 'fixture|NVDA|2026-07-20|BUY|92|88',
    snapshot: {
      generatedAt: '2026-07-20T16:00:00.000-04:00',
      profile: AnalysisProfile.SHORT_TERM,
      ticker: 'NVDA',
      recommendation: TodayAction.BUY,
      signalScore: 92,
      catalystScore: 88,
      setupQuality: SetupQuality.STRONG,
      catalyst: {
        type: CatalystType.EVENT,
        headline: 'NVDA earnings',
        ticker: 'NVDA',
        date: '2026-07-23T20:00:00.000Z',
        source: 'Fixture',
      },
      entryPrice: 120,
      entryCurrency: 'USD',
      evaluationWindow: { minDays: 1, maxDays: 5 },
      reason: 'Fixture: strong BUY with earnings catalyst.',
    },
    evaluationPrice: 132,
    evaluatedAt: '2026-07-24T16:00:00.000-04:00',
  },
  {
    dedupeKey: 'fixture|AAPL|2026-07-21|BUY|78|55',
    snapshot: {
      generatedAt: '2026-07-21T16:00:00.000-04:00',
      profile: AnalysisProfile.SHORT_TERM,
      ticker: 'AAPL',
      recommendation: TodayAction.BUY,
      signalScore: 78,
      catalystScore: 55,
      setupQuality: SetupQuality.MODERATE,
      catalyst: null,
      entryPrice: 200,
      entryCurrency: 'USD',
      evaluationWindow: { minDays: 1, maxDays: 5 },
      reason: 'Fixture: moderate BUY that faded.',
    },
    evaluationPrice: 194,
    evaluatedAt: '2026-07-25T16:00:00.000-04:00',
  },
  {
    dedupeKey: 'fixture|AMD|2026-07-22|SELL|28|0',
    snapshot: {
      generatedAt: '2026-07-22T16:00:00.000-04:00',
      profile: AnalysisProfile.SHORT_TERM,
      ticker: 'AMD',
      recommendation: TodayAction.SELL,
      signalScore: 28,
      catalystScore: 0,
      setupQuality: SetupQuality.WEAK,
      catalyst: null,
      entryPrice: 160,
      entryCurrency: 'USD',
      evaluationWindow: { minDays: 1, maxDays: 5 },
      reason: 'Fixture: SELL that worked (price fell).',
    },
    evaluationPrice: 148,
    evaluatedAt: '2026-07-26T16:00:00.000-04:00',
  },
  {
    dedupeKey: 'fixture|TSLA|2026-07-22|SELL|35|10',
    snapshot: {
      generatedAt: '2026-07-22T16:00:00.000-04:00',
      profile: AnalysisProfile.SHORT_TERM,
      ticker: 'TSLA',
      recommendation: TodayAction.SELL,
      signalScore: 35,
      catalystScore: 10,
      setupQuality: SetupQuality.WEAK,
      catalyst: null,
      entryPrice: 250,
      entryCurrency: 'USD',
      evaluationWindow: { minDays: 1, maxDays: 5 },
      reason: 'Fixture: SELL that failed (price rose).',
    },
    evaluationPrice: 265,
    evaluatedAt: '2026-07-26T16:00:00.000-04:00',
  },
  {
    dedupeKey: 'fixture|MSFT|2026-07-23|WATCH|64|40',
    snapshot: {
      generatedAt: '2026-07-23T16:00:00.000-04:00',
      profile: AnalysisProfile.SHORT_TERM,
      ticker: 'MSFT',
      recommendation: TodayAction.WATCH,
      signalScore: 64,
      catalystScore: 40,
      setupQuality: SetupQuality.MODERATE,
      catalyst: null,
      entryPrice: 420,
      entryCurrency: 'USD',
      evaluationWindow: { minDays: 1, maxDays: 5 },
      reason: 'Fixture: WATCH observation only.',
    },
    evaluationPrice: 428,
    evaluatedAt: '2026-07-27T16:00:00.000-04:00',
  },
  {
    dedupeKey: 'fixture|META|2026-07-23|WAIT|48|0',
    snapshot: {
      generatedAt: '2026-07-23T16:00:00.000-04:00',
      profile: AnalysisProfile.SHORT_TERM,
      ticker: 'META',
      recommendation: TodayAction.WAIT,
      signalScore: 48,
      catalystScore: 0,
      setupQuality: SetupQuality.WEAK,
      catalyst: null,
      entryPrice: 510,
      entryCurrency: 'USD',
      evaluationWindow: { minDays: 1, maxDays: 5 },
      reason: 'Fixture: WAIT observation only.',
    },
    evaluationPrice: 505,
    evaluatedAt: '2026-07-27T16:00:00.000-04:00',
  },
  {
    dedupeKey: 'fixture|SPY|2026-07-18|BUY|88|70',
    snapshot: {
      generatedAt: '2026-07-18T16:00:00.000-04:00',
      profile: AnalysisProfile.SHORT_TERM,
      ticker: 'SPY',
      recommendation: TodayAction.BUY,
      signalScore: 88,
      catalystScore: 70,
      setupQuality: SetupQuality.STRONG,
      catalyst: null,
      entryPrice: 550,
      entryCurrency: 'USD',
      evaluationWindow: { minDays: 1, maxDays: 5 },
      reason: 'Fixture: flat BUY (breakeven).',
    },
    evaluationPrice: 550,
    evaluatedAt: '2026-07-23T16:00:00.000-04:00',
  },
];

/**
 * Seed the ledger with historical fixtures and attach deterministic outcomes.
 * Idempotent via dedupe keys — safe to call multiple times.
 */
export async function seedHistoricalPredictionFixtures(
  repository: PredictionRepository,
): Promise<number> {
  let seeded = 0;

  for (const fixture of HISTORICAL_PREDICTION_FIXTURES) {
    const existing = await repository.findByDedupeKey(fixture.dedupeKey);
    const record =
      existing ??
      (await repository.create({
        dedupeKey: fixture.dedupeKey,
        ...fixture.snapshot,
      }));

    if (!existing) {
      seeded += 1;
    }

    if (record.outcome?.status === EvaluationStatus.EVALUATED) {
      continue;
    }

    const outcome = evaluatePrediction({
      prediction: record,
      observation: {
        price: fixture.evaluationPrice,
        observedAt: new Date(fixture.evaluatedAt),
      },
    });

    await repository.attachOutcome(record.id, outcome);
  }

  return seeded;
}
