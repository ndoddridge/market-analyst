import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { Recommendation } from '../analysis/types/analysis-result';
import type { LongTermCandidate } from '../market/long-term-decision';
import type { RankedCandidate } from '../market/short-term-decision';
import { SetupQuality, TodayAction } from '../market/types/market-today';
import { createManualPosition, parsePortfolioCsv } from './portfolio-csv';
import {
  calculateUnrealizedPlPercent,
  resolveLongTermPositionMove,
  resolvePositionMove,
} from './position-move';
import { PositionMove } from './types/portfolio';

function longTermCandidate(
  overrides: Partial<{
    recommendation: TodayAction;
    setupQuality: SetupQuality;
    score: number;
    ticker: string;
  }> = {},
): Pick<
  LongTermCandidate,
  'presentationRecommendation' | 'setupQuality' | 'result'
> {
  const ticker = overrides.ticker ?? 'AAPL';
  return {
    presentationRecommendation: overrides.recommendation ?? TodayAction.WATCH,
    setupQuality: overrides.setupQuality ?? SetupQuality.MODERATE,
    result: {
      ticker,
      companyName: ticker,
      profile: AnalysisProfile.LONG_TERM,
      recommendation: Recommendation.WATCH,
      score: overrides.score ?? 70,
      confidence: 0.6,
      suggestedHoldingWindow: { minDays: 180, maxDays: 730 },
      recommendedAction: 'Wait',
    },
  };
}

function candidate(
  overrides: Partial<{
    recommendation: TodayAction;
    setupQuality: SetupQuality;
    catalystScore: number;
    score: number;
    ticker: string;
  }> = {},
): Pick<
  RankedCandidate,
  'presentationRecommendation' | 'setupQuality' | 'catalystScore' | 'result'
> {
  const ticker = overrides.ticker ?? 'AAPL';
  return {
    presentationRecommendation: overrides.recommendation ?? TodayAction.WATCH,
    setupQuality: overrides.setupQuality ?? SetupQuality.MODERATE,
    catalystScore: overrides.catalystScore ?? 40,
    result: {
      ticker,
      companyName: ticker,
      profile: AnalysisProfile.SHORT_TERM,
      recommendation: Recommendation.WATCH,
      score: overrides.score ?? 70,
      confidence: 0.6,
      suggestedHoldingWindow: { minDays: 1, maxDays: 5 },
      recommendedAction: 'Wait',
    },
  };
}

describe('portfolio CSV parsing', () => {
  it('parses a valid CSV into positions', () => {
    const csv = `ticker,shares,avgCost,currentPrice
AAPL,10,285.00,313.33
AMD,5,180.00,165.20
TSM,8,350.00,340.00`;

    const result = parsePortfolioCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.positions).toEqual([
      { ticker: 'AAPL', shares: 10, avgCost: 285, currentPrice: 313.33 },
      { ticker: 'AMD', shares: 5, avgCost: 180, currentPrice: 165.2 },
      { ticker: 'TSM', shares: 8, avgCost: 350, currentPrice: 340 },
    ]);
  });

  it('rejects empty files and malformed headers', () => {
    expect(parsePortfolioCsv('').errors[0].message).toMatch(/empty/i);
    expect(
      parsePortfolioCsv('symbol,qty,cost,price\nAAPL,1,1,1').errors[0].message,
    ).toMatch(/header/i);
  });

  it('rejects invalid ticker, missing shares, invalid cost, and duplicates', () => {
    const csv = `ticker,shares,avgCost,currentPrice
AAPL,10,285,313
,5,180,165
AMD,0,180,165
TSM,8,-1,340
AAPL,2,290,300
BAD TICKER,1,1,1`;

    const result = parsePortfolioCsv(csv);
    expect(result.positions).toEqual([
      { ticker: 'AAPL', shares: 10, avgCost: 285, currentPrice: 313 },
    ]);
    expect(result.errors.map((error) => error.message).join(' ')).toMatch(
      /Invalid ticker|shares|avgCost|Duplicate|Invalid ticker/i,
    );
  });

  it('creates a manual position without fabricating fields', () => {
    const ok = createManualPosition({
      ticker: 'msft',
      shares: '3',
      avgCost: '400',
      currentPrice: '410.5',
    });
    expect(ok.position).toEqual({
      ticker: 'MSFT',
      shares: 3,
      avgCost: 400,
      currentPrice: 410.5,
    });

    const bad = createManualPosition({
      ticker: 'MSFT',
      shares: '',
      avgCost: 400,
      currentPrice: 410,
    });
    expect(bad.error).toMatch(/shares/i);
  });
});

describe('position move + P/L', () => {
  it('recommends ADD only for strong BUY evidence on an existing position', () => {
    const decision = resolvePositionMove(
      candidate({
        recommendation: TodayAction.BUY,
        setupQuality: SetupQuality.STRONG,
        catalystScore: 85,
        score: 90,
      }),
    );
    expect(decision.move).toBe(PositionMove.ADD);
  });

  it('does not ADD on high score alone without strong setup', () => {
    const decision = resolvePositionMove(
      candidate({
        recommendation: TodayAction.BUY,
        setupQuality: SetupQuality.MODERATE,
        catalystScore: 50,
        score: 90,
      }),
    );
    expect(decision.move).toBe(PositionMove.HOLD);
  });

  it('holds WATCH/WAIT existing positions', () => {
    expect(
      resolvePositionMove(
        candidate({ recommendation: TodayAction.WATCH, score: 70 }),
      ).move,
    ).toBe(PositionMove.HOLD);
    expect(
      resolvePositionMove(
        candidate({
          recommendation: TodayAction.WAIT,
          setupQuality: SetupQuality.WEAK,
          score: 50,
        }),
      ).move,
    ).toBe(PositionMove.HOLD);
  });

  it('sells or reduces on explicit SELL evidence', () => {
    expect(
      resolvePositionMove(
        candidate({
          recommendation: TodayAction.SELL,
          score: 20,
          setupQuality: SetupQuality.WEAK,
        }),
      ).move,
    ).toBe(PositionMove.SELL);

    expect(
      resolvePositionMove(
        candidate({
          recommendation: TodayAction.SELL,
          score: 42,
          setupQuality: SetupQuality.WEAK,
        }),
      ).move,
    ).toBe(PositionMove.REDUCE);
  });

  it('prefers HOLD when evidence is insufficient', () => {
    const decision = resolvePositionMove(
      candidate({
        recommendation: TodayAction.WAIT,
        setupQuality: SetupQuality.WEAK,
        score: 48,
        catalystScore: 0,
      }),
    );
    expect(decision.move).toBe(PositionMove.HOLD);
  });

  it('calculates unrealized P/L percent', () => {
    expect(calculateUnrealizedPlPercent(285, 313.33)).toBeCloseTo(9.94, 2);
    expect(calculateUnrealizedPlPercent(180, 165.2)).toBeCloseTo(-8.22, 2);
  });

  it('preserves original CSV line numbers when blank lines are present', () => {
    const csv = `ticker,shares,avgCost,currentPrice

AAPL,10,285,313

BAD,0,1,1
`;
    const result = parsePortfolioCsv(csv);
    expect(result.positions[0].ticker).toBe('AAPL');
    expect(result.errors.some((error) => error.line === 5)).toBe(true);
  });
});

describe('LONG_TERM position move', () => {
  it('recommends ADD only for a strong LONG_TERM BUY setup', () => {
    const decision = resolveLongTermPositionMove(
      longTermCandidate({
        recommendation: TodayAction.BUY,
        setupQuality: SetupQuality.STRONG,
        score: 80,
      }),
    );
    expect(decision.move).toBe(PositionMove.ADD);
  });

  it('does not ADD on a BUY recommendation without a strong setup', () => {
    const decision = resolveLongTermPositionMove(
      longTermCandidate({
        recommendation: TodayAction.BUY,
        setupQuality: SetupQuality.MODERATE,
        score: 90,
      }),
    );
    expect(decision.move).toBe(PositionMove.HOLD);
  });

  it('sells or reduces on explicit LONG_TERM SELL evidence', () => {
    expect(
      resolveLongTermPositionMove(
        longTermCandidate({ recommendation: TodayAction.SELL, score: 20 }),
      ).move,
    ).toBe(PositionMove.SELL);

    expect(
      resolveLongTermPositionMove(
        longTermCandidate({ recommendation: TodayAction.SELL, score: 42 }),
      ).move,
    ).toBe(PositionMove.REDUCE);
  });

  it('reduces on weak, low-score WATCH evidence rather than inventing conviction', () => {
    const decision = resolveLongTermPositionMove(
      longTermCandidate({
        recommendation: TodayAction.WATCH,
        setupQuality: SetupQuality.WEAK,
        score: 30,
      }),
    );
    expect(decision.move).toBe(PositionMove.REDUCE);
  });

  it('holds on moderate WATCH/HOLD evidence', () => {
    expect(
      resolveLongTermPositionMove(
        longTermCandidate({ recommendation: TodayAction.WATCH, score: 60 }),
      ).move,
    ).toBe(PositionMove.HOLD);
  });
});
