import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { Recommendation } from '../analysis/types/analysis-result';
import { MarketEventType } from '../events/types/market-event';
import type { MarketEvent } from '../events/types/market-event';
import type { NewsItem } from '../news/types/news-item';
import type { ScannerResult } from '../scanner/types/scanner-result';
import {
  decideShortTermOpportunity,
  evaluateShortTermCandidate,
} from './short-term-decision';
import { SetupQuality, TodayAction } from './types/market-today';

const NOW = new Date('2026-08-10T00:30:00.000Z');

function scannerResult(
  overrides: Partial<ScannerResult> & Pick<ScannerResult, 'ticker' | 'score'>,
): ScannerResult {
  return {
    companyName: overrides.ticker,
    profile: AnalysisProfile.SHORT_TERM,
    recommendation: Recommendation.BUY,
    confidence: 0.65,
    suggestedHoldingWindow: { minDays: 1, maxDays: 5 },
    recommendedAction: 'Open a position.',
    ...overrides,
  };
}

function earningsEvent(
  ticker: string,
  eventDate: string,
  title = `${ticker} earnings`,
): MarketEvent {
  return {
    id: `${ticker}-${eventDate}`,
    title,
    type: MarketEventType.EARNINGS,
    ticker,
    eventDate,
    provider: 'Yahoo Finance',
  };
}

describe('short-term decision logic', () => {
  it('ranks strong catalyst + strong scanner score as BUY with STRONG evidence', () => {
    const results = [
      scannerResult({ ticker: 'MSFT', score: 88, confidence: 0.7 }),
      scannerResult({ ticker: 'NVDA', score: 86, confidence: 0.72 }),
    ];
    const events = [earningsEvent('NVDA', '2026-08-13T20:00:00.000Z')];

    const decision = decideShortTermOpportunity(results, [], events, NOW);

    expect(decision.topOpportunity.ticker).toBe('NVDA');
    expect(decision.topOpportunity.recommendation).toBe(TodayAction.BUY);
    expect(decision.decision.setupQuality).toBe(SetupQuality.STRONG);
    expect(decision.decision.signalScore).toBe(86);
    expect(decision.decision.catalystScore).toBeGreaterThanOrEqual(70);
    expect(decision.catalyst?.headline).toContain('NVDA earnings');
    expect(decision.reason).toMatch(/strong setup|catalyst strength/i);
  });

  it('returns WATCH for relevant catalyst + moderate scanner score', () => {
    const results = [
      scannerResult({
        ticker: 'AAPL',
        score: 64,
        confidence: 0.55,
        recommendation: Recommendation.BUY,
      }),
      scannerResult({
        ticker: 'AMD',
        score: 22,
        confidence: 0.4,
        recommendation: Recommendation.SELL,
        suggestedHoldingWindow: { minDays: 0, maxDays: 0 },
      }),
    ];
    const news: NewsItem[] = [
      {
        id: 'aapl',
        title: 'Apple CEO outlines next product cycle after mixed demand',
        source: 'Wire',
        url: null,
        publishedAt: '2026-08-09T14:00:00.000Z',
        relatedTickers: ['AAPL'],
        querySymbol: 'AAPL',
        provider: 'Yahoo Finance',
      },
    ];

    const decision = decideShortTermOpportunity(results, news, [], NOW);

    expect(decision.topOpportunity.ticker).toBe('AAPL');
    expect(decision.topOpportunity.recommendation).toBe(TodayAction.WATCH);
    expect(decision.decision.setupQuality).toBe(SetupQuality.MODERATE);
    expect(decision.decision.signalScore).toBe(64);
    expect(decision.decision.catalystScore).toBeGreaterThan(0);
    expect(decision.decision.catalystScore).toBeLessThan(70);
  });

  it('does not give a meaningful ranking boost for a weak catalyst', () => {
    const results = [
      scannerResult({ ticker: 'MSFT', score: 88, confidence: 0.7 }),
      scannerResult({ ticker: 'NVDA', score: 78, confidence: 0.65 }),
    ];
    const news: NewsItem[] = [
      {
        id: 'weak',
        title:
          'Chinese wind turbine maker urges Burnham to overturn security ban',
        source: 'Wire',
        url: null,
        publishedAt: '2026-08-09T14:30:00.000Z',
        relatedTickers: ['SPY'],
        querySymbol: 'NVDA',
        provider: 'Yahoo Finance',
      },
    ];

    const without = decideShortTermOpportunity(results, [], [], NOW);
    const withWeak = decideShortTermOpportunity(results, news, [], NOW);

    expect(without.topOpportunity.ticker).toBe('MSFT');
    expect(withWeak.topOpportunity.ticker).toBe('MSFT');

    const nvdaWithout = evaluateShortTermCandidate(results[1], [], [], NOW);
    const nvdaWithWeak = evaluateShortTermCandidate(results[1], news, [], NOW);
    expect(nvdaWithWeak.actionScore).toBe(nvdaWithout.actionScore);
    expect(nvdaWithWeak.catalystScore).toBe(0);
  });

  it('rejects a VFIAX-style SPY article as catalyst evidence', () => {
    const results = [
      scannerResult({ ticker: 'SPY', score: 83, confidence: 0.6 }),
      scannerResult({
        ticker: 'TSM',
        score: 20,
        confidence: 0.6,
        recommendation: Recommendation.SELL,
        suggestedHoldingWindow: { minDays: 0, maxDays: 0 },
      }),
    ];
    const news: NewsItem[] = [
      {
        id: 'vfiax',
        title:
          'Forget VFIAX: Vanguard Sells You the Same S&P 500 Fund Without the $3,000 Toll, or the $75 Fee Fidelity Charges to Buy It',
        source: 'Yahoo Finance',
        url: null,
        publishedAt: '2026-08-09T16:04:46.000Z',
        relatedTickers: ['SPY', 'VFIAX'],
        querySymbol: 'SPY',
        provider: 'Yahoo Finance',
      },
    ];

    const decision = decideShortTermOpportunity(results, news, [], NOW);

    expect(decision.topOpportunity.ticker).toBe('SPY');
    expect(decision.catalyst).toBeNull();
    expect(decision.decision.catalystScore).toBe(0);
  });

  it('returns WAIT with WEAK setup when there is no catalyst and weak evidence', () => {
    const results = [
      scannerResult({
        ticker: 'AAPL',
        score: 48,
        confidence: 0.4,
        recommendation: Recommendation.BUY,
        suggestedHoldingWindow: { minDays: 5, maxDays: 15 },
      }),
      scannerResult({
        ticker: 'AMD',
        score: 20,
        confidence: 0.35,
        recommendation: Recommendation.SELL,
        suggestedHoldingWindow: { minDays: 0, maxDays: 0 },
      }),
    ];

    const decision = decideShortTermOpportunity(results, [], [], NOW);

    expect(decision.topOpportunity.ticker).toBe('AAPL');
    expect(decision.topOpportunity.recommendation).toBe(TodayAction.WAIT);
    expect(decision.decision.setupQuality).toBe(SetupQuality.WEAK);
    expect(decision.decision.signalScore).toBe(48);
    expect(decision.decision.catalystScore).toBe(0);
    expect(decision.catalyst).toBeNull();
    expect(decision.reason).toMatch(/WAIT/i);
  });

  it('ranks a lower scanner score higher when it has a relevant upcoming catalyst', () => {
    const results = [
      scannerResult({ ticker: 'MSFT', score: 88, confidence: 0.7 }),
      scannerResult({ ticker: 'NVDA', score: 78, confidence: 0.65 }),
    ];
    const events = [earningsEvent('NVDA', '2026-08-13T20:00:00.000Z')];

    const decision = decideShortTermOpportunity(results, [], events, NOW);

    expect(decision.topOpportunity.ticker).toBe('NVDA');
    expect(decision.catalyst?.headline).toContain('NVDA earnings');
  });
});
