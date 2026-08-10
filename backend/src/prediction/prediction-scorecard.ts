import { TodayAction } from '../market/types/market-today';
import { resolveEvaluationStatus, signalScoreBucket } from './prediction-evaluation';
import type { PredictionRecord } from './types/prediction';
import { EvaluationStatus } from './types/prediction-outcome';
import type {
  GroupScorecardStats,
  PredictionHistoryScorecard,
  RecommendationReturnStats,
} from './types/prediction-scorecard';

function avg(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

function accuracy(flags: boolean[]): number | null {
  if (flags.length === 0) {
    return null;
  }
  const wins = flags.filter(Boolean).length;
  return Math.round((wins / flags.length) * 1000) / 1000;
}

function emptyRecStats(): RecommendationReturnStats {
  return { count: 0, averageReturn: null };
}

function groupStats(
  key: string,
  records: PredictionRecord[],
): GroupScorecardStats {
  const evaluated = records.filter(
    (record) => record.outcome?.status === EvaluationStatus.EVALUATED,
  );
  const returns = evaluated
    .map((record) => record.outcome?.returnPercentage)
    .filter((value): value is number => value != null);
  const directional = evaluated
    .filter(
      (record) =>
        record.recommendation === TodayAction.BUY ||
        record.recommendation === TodayAction.SELL,
    )
    .map((record) => record.outcome?.directionallyCorrect)
    .filter((value): value is boolean => value != null);

  return {
    key,
    count: records.length,
    evaluatedCount: evaluated.length,
    directionalAccuracy: accuracy(directional),
    averageReturn: avg(returns),
  };
}

/**
 * Build an aggregate scorecard from immutable prediction records.
 */
export function buildPredictionScorecard(
  predictions: readonly PredictionRecord[],
): PredictionHistoryScorecard {
  const list = [...predictions];

  const evaluated = list.filter(
    (record) => resolveEvaluationStatus(record) === EvaluationStatus.EVALUATED,
  );
  const pending = list.filter(
    (record) => resolveEvaluationStatus(record) === EvaluationStatus.PENDING,
  );
  const unavailable = list.filter(
    (record) =>
      resolveEvaluationStatus(record) === EvaluationStatus.UNAVAILABLE,
  );
  const invalid = list.filter(
    (record) => resolveEvaluationStatus(record) === EvaluationStatus.INVALID,
  );

  const buy = list.filter((record) => record.recommendation === TodayAction.BUY);
  const sell = list.filter(
    (record) => record.recommendation === TodayAction.SELL,
  );
  const watchWait = list.filter(
    (record) =>
      record.recommendation === TodayAction.WATCH ||
      record.recommendation === TodayAction.WAIT ||
      record.recommendation === TodayAction.HOLD,
  );

  const directional = evaluated
    .filter(
      (record) =>
        record.recommendation === TodayAction.BUY ||
        record.recommendation === TodayAction.SELL,
    )
    .map((record) => record.outcome?.directionallyCorrect)
    .filter((value): value is boolean => value != null);

  const allReturns = evaluated
    .map((record) => record.outcome?.returnPercentage)
    .filter((value): value is number => value != null);

  const byRec = new Map<string, PredictionRecord[]>();
  for (const record of list) {
    const key = record.recommendation;
    const bucket = byRec.get(key) ?? [];
    bucket.push(record);
    byRec.set(key, bucket);
  }

  const averageReturnByRecommendation: Record<
    string,
    RecommendationReturnStats
  > = {
    BUY: emptyRecStats(),
    SELL: emptyRecStats(),
    WATCH: emptyRecStats(),
    WAIT: emptyRecStats(),
    HOLD: emptyRecStats(),
  };

  for (const [key, records] of byRec.entries()) {
    const returns = records
      .filter((record) => record.outcome?.status === EvaluationStatus.EVALUATED)
      .map((record) => record.outcome?.returnPercentage)
      .filter((value): value is number => value != null);
    averageReturnByRecommendation[key] = {
      count: records.length,
      averageReturn: avg(returns),
    };
  }

  const byTickerMap = new Map<string, PredictionRecord[]>();
  for (const record of list) {
    const key = record.ticker.toUpperCase();
    const bucket = byTickerMap.get(key) ?? [];
    bucket.push(record);
    byTickerMap.set(key, bucket);
  }

  const byQualityMap = new Map<string, PredictionRecord[]>();
  for (const record of list) {
    const key = record.setupQuality;
    const bucket = byQualityMap.get(key) ?? [];
    bucket.push(record);
    byQualityMap.set(key, bucket);
  }

  const byScoreMap = new Map<string, PredictionRecord[]>();
  for (const bucket of ['0-49', '50-69', '70-84', '85-100']) {
    byScoreMap.set(bucket, []);
  }
  for (const record of list) {
    const key = signalScoreBucket(record.signalScore);
    const bucket = byScoreMap.get(key) ?? [];
    bucket.push(record);
    byScoreMap.set(key, bucket);
  }

  return {
    totalPredictions: list.length,
    evaluatedPredictions: evaluated.length,
    pendingPredictions: pending.length,
    unavailablePredictions: unavailable.length,
    invalidPredictions: invalid.length,
    buyCount: buy.length,
    sellCount: sell.length,
    watchWaitCount: watchWait.length,
    directionalAccuracy: accuracy(directional),
    averageReturn: avg(allReturns),
    averageReturnByRecommendation,
    byTicker: [...byTickerMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, records]) => groupStats(key, records)),
    bySetupQuality: [...byQualityMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, records]) => groupStats(key, records)),
    byScoreBucket: [...byScoreMap.entries()].map(([key, records]) =>
      groupStats(key, records),
    ),
  };
}
