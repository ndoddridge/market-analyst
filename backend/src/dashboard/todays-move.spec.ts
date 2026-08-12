import {
  MarketDirection,
  SetupQuality,
  TodayAction,
} from '../market/types/market-today';
import {
  PositionMove,
  type PortfolioBuyCandidate,
  type PositionAnalysisCard,
} from '../portfolio/types/portfolio';
import { resolveTodaysMove } from './todays-move';
import { TodaysMoveAction } from './types/dashboard';

function positionCard(
  overrides: Partial<PositionAnalysisCard> = {},
): PositionAnalysisCard {
  return {
    ticker: 'AAPL',
    shares: 1,
    avgCost: 100,
    currentPrice: 110,
    unrealizedPlPercent: 10,
    marketValue: 110,
    unrealizedPlValue: 10,
    scannerRecommendation: TodayAction.WATCH,
    signalScore: 50,
    catalystScore: 0,
    setupQuality: SetupQuality.MODERATE,
    catalyst: null,
    marketDirection: MarketDirection.NEUTRAL,
    recommendedMove: PositionMove.HOLD,
    reason: 'reason',
    estimatedOpen: null,
    ...overrides,
  };
}

function buyCandidate(
  overrides: Partial<PortfolioBuyCandidate> = {},
): PortfolioBuyCandidate {
  return {
    ticker: 'NVDA',
    currentPrice: 500,
    priceUnavailable: false,
    signalScore: 80,
    recommendation: TodayAction.BUY,
    setupQuality: SetupQuality.STRONG,
    catalyst: null,
    reason: 'reason',
    ...overrides,
  };
}

describe('resolveTodaysMove', () => {
  it('returns WAIT when there are no positions and no buy candidates', () => {
    const result = resolveTodaysMove([], []);
    expect(result.action).toBe(TodaysMoveAction.WAIT);
    expect(result.ticker).toBeNull();
  });

  it('prioritizes SELL over everything else', () => {
    const positions = [
      positionCard({
        ticker: 'SELLME',
        recommendedMove: PositionMove.SELL,
        signalScore: 20,
      }),
      positionCard({
        ticker: 'ADDME',
        recommendedMove: PositionMove.ADD,
        signalScore: 99,
      }),
    ];
    const result = resolveTodaysMove(positions, [buyCandidate()]);
    expect(result.action).toBe(TodaysMoveAction.SELL);
    expect(result.ticker).toBe('SELLME');
  });

  it('prioritizes REDUCE over BUY/ADD/HOLD/WATCH', () => {
    const positions = [
      positionCard({
        ticker: 'TRIM',
        recommendedMove: PositionMove.REDUCE,
        signalScore: 10,
      }),
      positionCard({
        ticker: 'ADDME',
        recommendedMove: PositionMove.ADD,
        signalScore: 99,
      }),
    ];
    const result = resolveTodaysMove(positions, [
      buyCandidate({ signalScore: 99 }),
    ]);
    expect(result.action).toBe(TodaysMoveAction.REDUCE);
    expect(result.ticker).toBe('TRIM');
  });

  it('prioritizes a true BUY buy-candidate over ADD/HOLD/WATCH held positions', () => {
    const positions = [
      positionCard({
        ticker: 'ADDME',
        recommendedMove: PositionMove.ADD,
        signalScore: 99,
      }),
      positionCard({
        ticker: 'HOLDME',
        recommendedMove: PositionMove.HOLD,
        signalScore: 99,
      }),
    ];
    const result = resolveTodaysMove(positions, [
      buyCandidate({ ticker: 'NEWBUY' }),
    ]);
    expect(result.action).toBe(TodaysMoveAction.BUY);
    expect(result.ticker).toBe('NEWBUY');
  });

  it('never selects a WATCH-only buy candidate as a BUY action', () => {
    const positions = [
      positionCard({
        ticker: 'HOLDME',
        recommendedMove: PositionMove.HOLD,
        signalScore: 40,
      }),
    ];
    const result = resolveTodaysMove(positions, [
      buyCandidate({ ticker: 'JUSTWATCH', recommendation: TodayAction.WATCH }),
    ]);
    expect(result.action).not.toBe(TodaysMoveAction.BUY);
    expect(result.ticker).toBe('HOLDME');
  });

  it('prioritizes ADD over HOLD and WATCH', () => {
    const positions = [
      positionCard({
        ticker: 'ADDME',
        recommendedMove: PositionMove.ADD,
        signalScore: 10,
      }),
      positionCard({
        ticker: 'HOLDME',
        recommendedMove: PositionMove.HOLD,
        signalScore: 99,
      }),
    ];
    const result = resolveTodaysMove(positions, []);
    expect(result.action).toBe(TodaysMoveAction.ADD);
    expect(result.ticker).toBe('ADDME');
  });

  it('prioritizes HOLD over WATCH', () => {
    const positions = [
      positionCard({
        ticker: 'HOLDME',
        recommendedMove: PositionMove.HOLD,
        signalScore: 5,
      }),
      positionCard({
        ticker: 'WATCHME',
        recommendedMove: PositionMove.WATCH,
        signalScore: 99,
      }),
    ];
    const result = resolveTodaysMove(positions, []);
    expect(result.action).toBe(TodaysMoveAction.HOLD);
    expect(result.ticker).toBe('HOLDME');
  });

  it('tie-breaks by signal score within the same priority tier', () => {
    const positions = [
      positionCard({
        ticker: 'LOW',
        recommendedMove: PositionMove.SELL,
        signalScore: 10,
      }),
      positionCard({
        ticker: 'HIGH',
        recommendedMove: PositionMove.SELL,
        signalScore: 90,
      }),
    ];
    const result = resolveTodaysMove(positions, []);
    expect(result.ticker).toBe('HIGH');
  });
});
