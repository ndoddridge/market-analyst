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
  it('ranks a lower scanner score higher when it has a relevant upcoming catalyst', () => {
    const results = [
      scannerResult({ ticker: 'MSFT', score: 88, confidence: 0.7 }),
      scannerResult({ ticker: 'NVDA', score: 78, confidence: 0.65 }),
    ];
    const events = [earningsEvent('NVDA', '2026-08-13T20:00:00.000Z')];

    const decision = decideShortTermOpportunity(results, [], events, NOW);

    expect(decision.topOpportunity.ticker).toBe('NVDA');
    expect(decision.catalyst?.headline).toContain('NVDA earnings');
    expect(decision.reason).toMatch(/upcoming catalyst|near-term/i);
  });

  it('does not improve ranking for an unrelated catalyst', () => {
    const results = [
      scannerResult({ ticker: 'MSFT', score: 88, confidence: 0.7 }),
      scannerResult({ ticker: 'NVDA', score: 78, confidence: 0.65 }),
    ];
    // Headline/tags are not meaningfully about NVDA (loose adjacency only).
    const news: NewsItem[] = [
      {
        id: 'unrelated',
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
    // Catalyst for a different ticker must not lift NVDA.
    const events = [earningsEvent('AAPL', '2026-08-13T20:00:00.000Z')];

    const without = decideShortTermOpportunity(results, [], [], NOW);
    const withNoise = decideShortTermOpportunity(results, news, events, NOW);

    expect(without.topOpportunity.ticker).toBe('MSFT');
    expect(withNoise.topOpportunity.ticker).toBe('MSFT');
    expect(withNoise.catalyst).toBeNull();

    const nvdaWithout = evaluateShortTermCandidate(results[1], [], [], NOW);
    const nvdaWithNoise = evaluateShortTermCandidate(
      results[1],
      news,
      events,
      NOW,
    );
    expect(nvdaWithNoise.actionScore).toBe(nvdaWithout.actionScore);
  });

  it('does not improve ranking for a stale or already-passed catalyst', () => {
    const results = [
      scannerResult({ ticker: 'MSFT', score: 88, confidence: 0.7 }),
      scannerResult({ ticker: 'NVDA', score: 78, confidence: 0.65 }),
    ];
    const pastEvents = [
      earningsEvent('NVDA', '2026-08-05T20:00:00.000Z', 'NVDA past earnings'),
    ];
    const staleNews: NewsItem[] = [
      {
        id: 'stale',
        title: 'NVIDIA reports record data-center demand',
        source: 'Wire',
        url: null,
        publishedAt: '2026-07-01T00:00:00.000Z',
        relatedTickers: ['NVDA'],
        querySymbol: 'NVDA',
        provider: 'Yahoo Finance',
      },
    ];

    const without = decideShortTermOpportunity(results, [], [], NOW);
    const withStale = decideShortTermOpportunity(
      results,
      staleNews,
      pastEvents,
      NOW,
    );

    expect(without.topOpportunity.ticker).toBe('MSFT');
    expect(withStale.topOpportunity.ticker).toBe('MSFT');
    expect(withStale.catalyst).toBeNull();

    const nvdaWithout = evaluateShortTermCandidate(results[1], [], [], NOW);
    const nvdaWithStale = evaluateShortTermCandidate(
      results[1],
      staleNews,
      pastEvents,
      NOW,
    );
    expect(nvdaWithStale.actionScore).toBeLessThan(nvdaWithout.actionScore);
  });

  it('returns WATCH/WAIT when there is not enough evidence for a strong BUY setup', () => {
    const results = [
      scannerResult({
        ticker: 'AAPL',
        score: 62,
        confidence: 0.45,
        recommendation: Recommendation.BUY,
        suggestedHoldingWindow: { minDays: 5, maxDays: 15 },
      }),
      scannerResult({
        ticker: 'AMD',
        score: 28,
        confidence: 0.4,
        recommendation: Recommendation.SELL,
        suggestedHoldingWindow: { minDays: 0, maxDays: 0 },
      }),
    ];

    const decision = decideShortTermOpportunity(results, [], [], NOW);

    expect(decision.topOpportunity.ticker).toBe('AAPL');
    expect(decision.topOpportunity.recommendation).toBe(Recommendation.WATCH);
    expect(decision.topOpportunity.score).toBe(62);
    expect(decision.catalyst).toBeNull();
    expect(decision.reason).toMatch(/WATCH\/WAIT/i);
  });
});
