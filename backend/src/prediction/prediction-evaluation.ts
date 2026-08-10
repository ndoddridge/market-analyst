import { TodayAction } from '../market/types/market-today';
import {
  getMarketCalendarDate,
  marketCalendarDaysBetween,
} from '../shared/market-clock';
import type { PredictionRecord } from './types/prediction';
import {
  OutcomeClassification,
  type PredictionOutcome,
} from './types/prediction-outcome';

const BREAKEVEN_EPS = 0.05; // percent

export type EvaluatePredictionInput = {
  prediction: PredictionRecord;
  evaluationPrice: number | null;
  evaluatedAt?: Date;
};

/**
 * Pure outcome evaluation. Never mutates the original prediction.
 */
export function evaluatePrediction(
  input: EvaluatePredictionInput,
): PredictionOutcome {
  const evaluatedAt = input.evaluatedAt ?? new Date();
  const generatedAt = new Date(input.prediction.generatedAt);
  const daysElapsed = Number.isNaN(generatedAt.getTime())
    ? 0
    : marketCalendarDaysBetween(generatedAt, evaluatedAt);

  if (
    input.evaluationPrice == null ||
    !Number.isFinite(input.evaluationPrice) ||
    input.evaluationPrice <= 0 ||
    input.prediction.entryPrice == null ||
    !Number.isFinite(input.prediction.entryPrice) ||
    input.prediction.entryPrice <= 0
  ) {
    return {
      predictionId: input.prediction.id,
      evaluatedAt: toEvalIso(evaluatedAt),
      priceAtEvaluation:
        input.evaluationPrice != null && Number.isFinite(input.evaluationPrice)
          ? input.evaluationPrice
          : null,
      returnPercentage: null,
      directionallyCorrect: null,
      outcomeClassification: OutcomeClassification.INSUFFICIENT_DATA,
      daysElapsed,
    };
  }

  const returnPercentage =
    ((input.evaluationPrice - input.prediction.entryPrice) /
      input.prediction.entryPrice) *
    100;

  const roundedReturn = roundReturn(returnPercentage);
  const classification = classifyOutcome(
    input.prediction.recommendation,
    roundedReturn,
  );
  const directionallyCorrect = resolveDirectionalCorrectness(
    input.prediction.recommendation,
    roundedReturn,
  );

  return {
    predictionId: input.prediction.id,
    evaluatedAt: toEvalIso(evaluatedAt),
    priceAtEvaluation: input.evaluationPrice,
    returnPercentage: roundedReturn,
    directionallyCorrect,
    outcomeClassification: classification,
    daysElapsed,
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

function roundReturn(value: number): number {
  return Math.round(value * 100) / 100;
}

function toEvalIso(date: Date): string {
  // Keep evaluation stamps ISO-compatible; market clock formatting is optional here.
  return date.toISOString();
}
