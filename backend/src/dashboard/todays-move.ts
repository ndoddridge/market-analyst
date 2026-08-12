import { TodayAction } from '../market/types/market-today';
import {
  PositionMove,
  type PortfolioBuyCandidate,
  type PositionAnalysisCard,
} from '../portfolio/types/portfolio';
import { TodaysMoveAction, type TodaysMove } from './types/dashboard';

const POSITION_MOVE_TO_ACTION: Record<
  PositionMove,
  { action: TodaysMoveAction; priority: number }
> = {
  [PositionMove.SELL]: { action: TodaysMoveAction.SELL, priority: 0 },
  [PositionMove.REDUCE]: { action: TodaysMoveAction.REDUCE, priority: 1 },
  [PositionMove.ADD]: { action: TodaysMoveAction.ADD, priority: 3 },
  [PositionMove.HOLD]: { action: TodaysMoveAction.HOLD, priority: 4 },
  [PositionMove.WATCH]: { action: TodaysMoveAction.WATCH, priority: 5 },
};

const BUY_CANDIDATE_PRIORITY = 2;

type Entry = {
  priority: number;
  ticker: string;
  action: TodaysMoveAction;
  currentPrice: number | null;
  score: number;
  reason: string;
};

/**
 * Single highest-priority action across held positions + the top buy
 * candidate. Priority: SELL > REDUCE > BUY > ADD > HOLD > WATCH > WAIT.
 * Operates only on data the snapshot already gathered — never re-scans.
 */
export function resolveTodaysMove(
  positions: readonly PositionAnalysisCard[],
  buyCandidates: readonly PortfolioBuyCandidate[],
): TodaysMove {
  const entries: Entry[] = positions.map((position) => {
    const mapped = POSITION_MOVE_TO_ACTION[position.recommendedMove];
    return {
      priority: mapped.priority,
      ticker: position.ticker,
      action: mapped.action,
      currentPrice: position.currentPrice,
      score: position.signalScore,
      reason: position.reason,
    };
  });

  const topBuy = buyCandidates.find(
    (candidate) => candidate.recommendation === TodayAction.BUY,
  );
  if (topBuy) {
    entries.push({
      priority: BUY_CANDIDATE_PRIORITY,
      ticker: topBuy.ticker,
      action: TodaysMoveAction.BUY,
      currentPrice: topBuy.currentPrice,
      score: topBuy.signalScore,
      reason: topBuy.reason,
    });
  }

  if (entries.length === 0) {
    return {
      ticker: null,
      action: TodaysMoveAction.WAIT,
      currentPrice: null,
      confidence: 0,
      reason:
        'No portfolio positions or qualifying buy candidates are available right now.',
    };
  }

  entries.sort((a, b) => a.priority - b.priority || b.score - a.score);
  const winner = entries[0];

  return {
    ticker: winner.ticker,
    action: winner.action,
    currentPrice: winner.currentPrice,
    confidence: winner.score,
    reason: winner.reason,
  };
}
