import { isNewsRelevantToTicker } from './catalyst-relevance';
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
  it('rejects an obviously unrelated company story tagged to SPY', () => {
    const item = news({
      title: 'Chinese wind turbine maker urges Burnham to overturn security ban',
      relatedTickers: ['SPY', 'NVDA'],
      querySymbol: 'SPY',
    });

    expect(isNewsRelevantToTicker(item, 'SPY')).toBe(false);
  });

  it('rejects an unrelated story that only has SPY as querySymbol/fallback tag', () => {
    const item = news({
      title: 'Chinese wind turbine maker urges Burnham to overturn security ban',
      relatedTickers: [],
      querySymbol: 'SPY',
    });

    expect(isNewsRelevantToTicker(item, 'SPY')).toBe(false);
  });

  it('accepts a broad market headline for SPY', () => {
    const item = news({
      title: 'S&P 500 futures rise as Wall Street digests inflation data',
      relatedTickers: ['^GSPC', 'SPY'],
      querySymbol: 'SPY',
    });

    expect(isNewsRelevantToTicker(item, 'SPY')).toBe(true);
  });

  it('accepts an ETF headline that explicitly mentions SPY', () => {
    const item = news({
      title: 'VOO Is About to Become the First $1 Trillion ETF, and SPY Holders Are Paying 3x More',
      relatedTickers: ['SPY', 'VOO'],
      querySymbol: 'SPY',
    });

    expect(isNewsRelevantToTicker(item, 'SPY')).toBe(true);
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
});
