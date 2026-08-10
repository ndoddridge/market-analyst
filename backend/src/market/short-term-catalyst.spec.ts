import type { NewsItem } from '../news/types/news-item';
import {
  isEtfOrFundProductOrPromoStory,
  isMeaningfulShortTermNewsCatalyst,
  scoreShortTermNewsCatalyst,
} from './short-term-catalyst';

function news(partial: Partial<NewsItem> & Pick<NewsItem, 'title'>): NewsItem {
  return {
    id: partial.id ?? 'n1',
    title: partial.title,
    source: partial.source ?? 'Wire',
    url: partial.url ?? null,
    publishedAt: partial.publishedAt ?? '2026-08-09T12:00:00.000Z',
    relatedTickers: partial.relatedTickers ?? ['SPY'],
    querySymbol: partial.querySymbol ?? 'SPY',
    provider: partial.provider ?? 'Yahoo Finance',
  };
}

describe('short-term catalyst quality', () => {
  const now = new Date('2026-08-10T00:30:00.000Z');

  it('rejects a VFIAX-style fund product/fee comparison as an SPY catalyst', () => {
    const item = news({
      title:
        'Forget VFIAX: Vanguard Sells You the Same S&P 500 Fund Without the $3,000 Toll, or the $75 Fee Fidelity Charges to Buy It',
      relatedTickers: ['SPY', 'VFIAX'],
      querySymbol: 'SPY',
      publishedAt: '2026-08-09T16:04:46.000Z',
    });

    expect(isEtfOrFundProductOrPromoStory(item.title)).toBe(true);
    expect(isMeaningfulShortTermNewsCatalyst(item, 'SPY')).toBe(false);
    expect(scoreShortTermNewsCatalyst(item, 'SPY', now)).toBe(-1);
  });

  it('rejects other ETF fee / promotional packaging stories for SPY', () => {
    const item = news({
      title:
        'VOO Is About to Become the First $1 Trillion ETF, and SPY Holders Are Paying 3x More for the Same Index',
      relatedTickers: ['SPY', 'VOO'],
      querySymbol: 'SPY',
    });

    expect(isMeaningfulShortTermNewsCatalyst(item, 'SPY')).toBe(false);
    expect(scoreShortTermNewsCatalyst(item, 'SPY', now)).toBe(-1);
  });

  it('accepts broad market-moving news as an SPY short-term catalyst', () => {
    const item = news({
      title: 'S&P 500 futures rise as Wall Street digests inflation data',
      relatedTickers: ['^GSPC', 'SPY'],
      querySymbol: 'SPY',
    });

    expect(isMeaningfulShortTermNewsCatalyst(item, 'SPY')).toBe(true);
    expect(scoreShortTermNewsCatalyst(item, 'SPY', now)).toBeGreaterThan(0);
  });

  it('accepts direct SPY price-action headlines', () => {
    const item = news({
      title: 'SPY climbs as investors rotate into large-cap exposure',
      relatedTickers: ['SPY'],
      querySymbol: 'SPY',
    });

    expect(isMeaningfulShortTermNewsCatalyst(item, 'SPY')).toBe(true);
  });

  it('rejects loosely tagged company fluff that is not market-moving for SPY', () => {
    const item = news({
      title:
        'Chinese wind turbine maker urges Burnham to overturn security ban',
      relatedTickers: ['SPY', 'NVDA'],
      querySymbol: 'SPY',
    });

    expect(isMeaningfulShortTermNewsCatalyst(item, 'SPY')).toBe(false);
  });

  it('accepts ticker-specific company substance for single-name names', () => {
    const item = news({
      title: 'NVIDIA demand stays strong into next quarter',
      relatedTickers: ['NVDA'],
      querySymbol: 'NVDA',
    });

    expect(isMeaningfulShortTermNewsCatalyst(item, 'NVDA')).toBe(true);
    expect(isMeaningfulShortTermNewsCatalyst(item, 'SPY')).toBe(false);
  });
});
