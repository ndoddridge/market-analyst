import { TodayAction } from '../market/types/market-today';
import {
  getMarketCalendarDate,
  marketCalendarDaysBetween,
  toMarketIsoString,
} from '../shared/market-clock';
import type { PredictionRecord } from './types/prediction';
import {
  EvaluationStatus,
  OutcomeClassification,
  type PredictionOutcome,
} from './types/prediction-outcome';

const BREAKEVEN_EPS = 0.05; // percent

export type PriceObservation = {
  price: number | null;
  observedAt?: Date;
};

export type EvaluatePredictionInput = {
  prediction: PredictionRecord;
  observation: PriceObservation;
  /** When true, allow evaluation even before minDays (tests only — default false). */
  ignoreWindowGate?: boolean;
};

/**
 * Pure deterministic evaluation engine.
 * Never mutates the original prediction snapshot.
 */
export function evaluatePrediction(
  input: EvaluatePredictionInput,
): PredictionOutcome {
  const evaluatedAt = input.observation.observedAt ?? new Date();
  const generatedAt = new Date(input.prediction.generatedAt);
  const daysElapsed = Number.isNaN(generatedAt.getTime())
    ? 0
    : marketCalendarDaysBetween(generatedAt, evaluatedAt);

  const { minDays, maxDays } = input.prediction.evaluationWindow;

  if (Number.isNaN(generatedAt.getTime()) || minDays < 0 || maxDays < minDays) {
    return baseOutcome(input.prediction.id, evaluatedAt, daysElapsed, {
      status: EvaluationStatus.INVALID,
      detail: 'Prediction has an invalid generatedAt or evaluation window.',
    });
  }

  // Window not yet open — do not score.
  if (!input.ignoreWindowGate && daysElapsed < minDays) {
    return baseOutcome(input.prediction.id, evaluatedAt, daysElapsed, {
      status: EvaluationStatus.INVALID,
      detail: `Evaluation window opens after ${minDays} day(s); only ${daysElapsed} day(s) have elapsed.`,
    });
  }

  const evaluationPrice = input.observation.price;
  const entryPrice = input.prediction.entryPrice;

  if (
    evaluationPrice == null ||
    !Number.isFinite(evaluationPrice) ||
    evaluationPrice <= 0 ||
    entryPrice == null ||
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0
  ) {
    return baseOutcome(input.prediction.id, evaluatedAt, daysElapsed, {
      status: EvaluationStatus.UNAVAILABLE,
      priceAtEvaluation:
        evaluationPrice != null && Number.isFinite(evaluationPrice)
          ? evaluationPrice
          : null,
      detail: 'Missing or invalid entry/evaluation price; no fabricated prices used.',
    });
  }

  const returnPercentage = roundReturn(
    ((evaluationPrice - entryPrice) / entryPrice) * 100,
  );
  const classification = classifyOutcome(
    input.prediction.recommendation,
    returnPercentage,
  );
  const directionallyCorrect = resolveDirectionalCorrectness(
    input.prediction.recommendation,
    returnPercentage,
  );

  const afterWindow = daysElapsed > maxDays;
  return {
    predictionId: input.prediction.id,
    status: EvaluationStatus.EVALUATED,
    evaluatedAt: toEvalIso(evaluatedAt),
    priceAtEvaluation: evaluationPrice,
    returnPercentage,
    directionallyCorrect,
    outcomeClassification: classification,
    daysElapsed,
    detail: afterWindow
      ? `Evaluated ${daysElapsed - maxDays} day(s) after the max window (${maxDays}).`
      : null,
  };
}

export function isWithinEvaluationWindow(
  prediction: PredictionRecord,
  at: Date = new Date(),
): boolean {
  const generatedAt = new Date(prediction.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) {
    return false;
  }
  const days = marketCalendarDaysBetween(generatedAt, at);
  const { minDays, maxDays } = prediction.evaluationWindow;
  return days >= minDays && days <= maxDays;
}

export function isEvaluationWindowComplete(
  prediction: PredictionRecord,
  at: Date = new Date(),
): boolean {
  const generatedAt = new Date(prediction.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) {
    return false;
  }
  const days = marketCalendarDaysBetween(generatedAt, at);
  return days >= prediction.evaluationWindow.minDays;
}

export function resolveEvaluationStatus(
  prediction: PredictionRecord,
): EvaluationStatus {
  if (!prediction.outcome) {
    return EvaluationStatus.PENDING;
  }
  return prediction.outcome.status;
}

export function buildPredictionDedupeKey(parts: {
  profile: string;
  ticker: string;
  generatedAt: string | Date;
  recommendation: string;
  signalScore: number;
  catalystScore: number;
}): string {
  const date =
    typeof parts.generatedAt === 'string'
      ? getMarketCalendarDate(new Date(parts.generatedAt))
      : getMarketCalendarDate(parts.generatedAt);

  return [
    parts.profile,
    parts.ticker.toUpperCase(),
    date,
    parts.recommendation,
    parts.signalScore,
    parts.catalystScore,
  ].join('|');
}

export function signalScoreBucket(score: number): string {
  if (score < 50) {
    return '0-49';
  }
  if (score < 70) {
    return '50-69';
  }
  if (score < 85) {
    return '70-84';
  }
  return '85-100';
}

function classifyOutcome(
  recommendation: TodayAction,
  returnPercentage: number,
): OutcomeClassification {
  if (
    recommendation === TodayAction.WATCH ||
    recommendation === TodayAction.WAIT ||
    recommendation === TodayAction.HOLD
  ) {
    return OutcomeClassification.OBSERVED;
  }

  if (Math.abs(returnPercentage) <= BREAKEVEN_EPS) {
    return OutcomeClassification.BREAKEVEN;
  }

  if (recommendation === TodayAction.BUY) {
    return returnPercentage > 0
      ? OutcomeClassification.WIN
      : OutcomeClassification.LOSS;
  }

  if (recommendation === TodayAction.SELL) {
    return returnPercentage < 0
      ? OutcomeClassification.WIN
      : OutcomeClassification.LOSS;
  }

  return OutcomeClassification.OBSERVED;
}

function resolveDirectionalCorrectness(
  recommendation: TodayAction,
  returnPercentage: number,
): boolean | null {
  if (
    recommendation === TodayAction.WATCH ||
    recommendation === TodayAction.WAIT ||
    recommendation === TodayAction.HOLD
  ) {
    return null;
  }

  if (Math.abs(returnPercentage) <= BREAKEVEN_EPS) {
    return null;
  }

  if (recommendation === TodayAction.BUY) {
    return returnPercentage > 0;
  }

  if (recommendation === TodayAction.SELL) {
    return returnPercentage < 0;
  }

  return null;
}

function baseOutcome(
  predictionId: string,
  evaluatedAt: Date,
  daysElapsed: number,
  partial: Partial<PredictionOutcome> & { status: EvaluationStatus },
): PredictionOutcome {
  return {
    predictionId,
    status: partial.status,
    evaluatedAt: toEvalIso(evaluatedAt),
    priceAtEvaluation: partial.priceAtEvaluation ?? null,
    returnPercentage: partial.returnPercentage ?? null,
    directionallyCorrect: partial.directionallyCorrect ?? null,
    outcomeClassification: partial.outcomeClassification ?? null,
    daysElapsed,
    detail: partial.detail ?? null,
  };
}

function roundReturn(value: number): number {
  return Math.round(value * 100) / 100;
}

function toEvalIso(date: Date): string {
  try {
    return toMarketIsoString(date);
  } catch {
    return date.toISOString();
  }
}
