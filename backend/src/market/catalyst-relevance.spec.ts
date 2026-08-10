import {
  isNewsRelevantToTicker,
  isPeerEtfProductStory,
  scoreNewsCatalyst,
} from './catalyst-relevance';
import type { NewsItem } from '../news/types/news-item';

function news(partial: Partial<NewsItem> & Pick<NewsItem, 'title'>): NewsItem {
  return {
    id: partial.id ?? 'n1',
    title: partial.title,
    source: partial.source ?? 'Wire',
    url: partial.url ?? null,
    publishedAt: partial.publishedAt ?? '2026-08-09T12:00:00.000Z',
    relatedTickers: partial.relatedTickers ?? [],
    querySymbol: partial.querySymbol ?? 'SPY',
    provider: partial.provider ?? 'Yahoo Finance',
  };
}

describe('catalyst relevance', () => {
  const now = new Date('2026-08-09T20:00:00.000Z');

  it('rejects an obviously unrelated company story tagged to SPY', () => {
    const item = news({
      title: 'Chinese wind turbine maker urges Burnham to overturn security ban',
      relatedTickers: ['SPY', 'NVDA'],
      querySymbol: 'SPY',
    });

    expect(isNewsRelevantToTicker(item, 'SPY')).toBe(false);
    expect(scoreNewsCatalyst(item, 'SPY', now)).toBe(-1);
  });

  it('rejects a VOO-only product story for SPY even when SPY holders are mentioned', () => {
    const item = news({
      title:
        'VOO Is About to Become the First $1 Trillion ETF, and SPY Holders Are Paying 3x More for the Same Index',
      relatedTickers: ['SPY', 'VOO'],
      querySymbol: 'SPY',
    });

    expect(isPeerEtfProductStory(item.title, 'SPY')).toBe(true);
    expect(isNewsRelevantToTicker(item, 'SPY')).toBe(false);
    expect(scoreNewsCatalyst(item, 'SPY', now)).toBe(-1);
  });

  it('accepts a direct SPY catalyst headline', () => {
    const item = news({
      title: 'SPY climbs as investors rotate into large-cap exposure',
      relatedTickers: ['SPY'],
      querySymbol: 'SPY',
    });

    expect(isNewsRelevantToTicker(item, 'SPY')).toBe(true);
    expect(scoreNewsCatalyst(item, 'SPY', now)).toBeGreaterThan(100);
  });

  it('accepts a broad-market catalyst when materially relevant to SPY', () => {
    const item = news({
      title: 'S&P 500 futures rise as Wall Street digests inflation data',
      relatedTickers: ['^GSPC', 'SPY'],
      querySymbol: 'SPY',
    });

    expect(isNewsRelevantToTicker(item, 'SPY')).toBe(true);
    expect(scoreNewsCatalyst(item, 'SPY', now)).toBeGreaterThan(0);
  });

  it('rejects a generic ETF article that never mentions SPY or the broad market', () => {
    const item = news({
      title:
        "This Is the 1 ETF Warren Buffett Recommends Most People Buy -- and History Says He's Always Been Right",
      relatedTickers: ['^GSPC', 'VOO', 'NVDA'],
      querySymbol: 'SPY',
    });

    expect(isNewsRelevantToTicker(item, 'SPY')).toBe(false);
  });

  it('rejects another product ETF story even if it mentions Nasdaq', () => {
    const item = news({
      title:
        'What JEPQ Actually Paid the Last Time the Nasdaq Fell 10%: a Stress Test for Its 10% Yield',
      relatedTickers: ['JEPQ', '^IXIC'],
      querySymbol: 'SPY',
    });

    expect(isNewsRelevantToTicker(item, 'SPY')).toBe(false);
  });

  it('accepts ticker-specific company news for a single-name opportunity', () => {
    const item = news({
      title: 'NVIDIA demand stays strong into next quarter',
      relatedTickers: ['NVDA'],
      querySymbol: 'NVDA',
    });

    expect(isNewsRelevantToTicker(item, 'NVDA')).toBe(true);
    expect(isNewsRelevantToTicker(item, 'SPY')).toBe(false);
  });

  it('ranks a direct ticker catalyst above a broad-market article', () => {
    const direct = news({
      title: 'SPY attracts fresh inflows ahead of the open',
      relatedTickers: ['SPY'],
      querySymbol: 'SPY',
      publishedAt: '2026-08-09T15:00:00.000Z',
    });
    const broad = news({
      id: 'n2',
      title: 'Wall Street futures steady after inflation report',
      relatedTickers: ['^GSPC'],
      querySymbol: 'SPY',
      publishedAt: '2026-08-09T15:00:00.000Z',
    });

    expect(scoreNewsCatalyst(direct, 'SPY', now)).toBeGreaterThan(
      scoreNewsCatalyst(broad, 'SPY', now),
    );
  });
});
