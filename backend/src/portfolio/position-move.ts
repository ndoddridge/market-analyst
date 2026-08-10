import {
  SetupQuality,
  TodayAction,
} from '../market/types/market-today';
import type { RankedCandidate } from '../market/short-term-decision';
import { PositionMove } from './types/portfolio';

export type PositionMoveDecision = {
  move: PositionMove;
  reason: string;
};

/**
 * Personalized move for an EXISTING position using SHORT_TERM decision evidence.
 * Does not invent a second scoring model — maps existing scanner/decision output.
 */
export function resolvePositionMove(
  candidate: Pick<
    RankedCandidate,
    | 'presentationRecommendation'
    | 'setupQuality'
    | 'catalystScore'
    | 'result'
  >,
): PositionMoveDecision {
  const recommendation = candidate.presentationRecommendation;
  const setupQuality = candidate.setupQuality;
  const signalScore = candidate.result.score;
  const catalystScore = candidate.catalystScore;
  const ticker = candidate.result.ticker;

  if (recommendation === TodayAction.SELL) {
    // Explicit sell evidence → SELL unless score suggests a softer trim.
    if (signalScore > 35) {
      return {
        move: PositionMove.REDUCE,
        reason: `${ticker} carries explicit sell pressure (scanner score ${signalScore}), so reduce rather than exit entirely while evidence is not extreme.`,
      };
    }
    return {
      move: PositionMove.SELL,
      reason: `${ticker} shows clear sell evidence (scanner score ${signalScore}); exit the existing position.`,
    };
  }

  if (recommendation === TodayAction.BUY) {
    // Require strong setup — never add on raw score or catalyst headline alone.
    if (
      setupQuality === SetupQuality.STRONG &&
      catalystScore >= 70 &&
      signalScore >= 75
    ) {
      return {
        move: PositionMove.ADD,
        reason: `${ticker} already held, and SHORT_TERM evidence is strong (setup ${setupQuality}, catalyst ${catalystScore}/100) — adding is justified.`,
      };
    }

    return {
      move: PositionMove.HOLD,
      reason: `Scanner evidence remains constructive for ${ticker}, but catalyst strength and setup quality do not justify adding at this time.`,
    };
  }

  if (
    recommendation === TodayAction.WATCH ||
    recommendation === TodayAction.WAIT ||
    recommendation === TodayAction.HOLD
  ) {
    if (setupQuality === SetupQuality.WEAK && signalScore < 45) {
      return {
        move: PositionMove.REDUCE,
        reason: `${ticker} evidence is weak/unclear (setup ${setupQuality}, score ${signalScore}); trim risk rather than invent conviction.`,
      };
    }

    if (recommendation === TodayAction.WAIT && setupQuality === SetupQuality.WEAK) {
      return {
        move: PositionMove.HOLD,
        reason: `Evidence for ${ticker} is insufficient for an active trade change — hold the existing position and wait for clearer SHORT_TERM confirmation.`,
      };
    }

    return {
      move: PositionMove.HOLD,
      reason: `${ticker} is already held and scanner conviction is only ${recommendation}; hold rather than add or exit.`,
    };
  }

  return {
    move: PositionMove.WATCH,
    reason: `SHORT_TERM evidence for ${ticker} is inconclusive — watch the position without forcing a trade.`,
  };
}

export function calculateUnrealizedPlPercent(
  avgCost: number,
  currentPrice: number,
): number {
  if (!Number.isFinite(avgCost) || avgCost <= 0) {
    return 0;
  }
  return Math.round(((currentPrice - avgCost) / avgCost) * 10000) / 100;
}
