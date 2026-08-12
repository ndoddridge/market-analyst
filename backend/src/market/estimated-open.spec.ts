import { estimateNextOpen } from './estimated-open';
import { GapDirection } from './types/estimated-open';
import type { ExtendedQuote } from './types/extended-quote';

function quote(overrides: Partial<ExtendedQuote> = {}): ExtendedQuote {
  return {
    symbol: 'AAPL',
    regularMarketPreviousClose: null,
    preMarketPrice: null,
    postMarketPrice: null,
    regularMarketDayHigh: null,
    regularMarketDayLow: null,
    marketState: null,
    ...overrides,
  };
}

describe('estimateNextOpen', () => {
  it('is unavailable with no fields fabricated when previous close is missing', () => {
    const result = estimateNextOpen(quote({ postMarketPrice: 185 }));
    expect(result).toEqual({
      available: false,
      lowEstimate: null,
      highEstimate: null,
      estimatedChangePercent: null,
      gapDirection: null,
      method: null,
    });
  });

  it('is unavailable when no extended-hours price is present', () => {
    const result = estimateNextOpen(quote({ regularMarketPreviousClose: 180 }));
    expect(result.available).toBe(false);
  });

  it('never returns a bare single price field alongside a range', () => {
    const result = estimateNextOpen(
      quote({
        regularMarketPreviousClose: 180,
        postMarketPrice: 182,
        regularMarketDayHigh: 183,
        regularMarketDayLow: 179,
      }),
    );
    expect(result).not.toHaveProperty('price');
    expect(result.lowEstimate).not.toBeNull();
    expect(result.highEstimate).not.toBeNull();
    expect(result.lowEstimate as number).toBeLessThan(
      result.highEstimate as number,
    );
  });

  it('computes an UP gap direction and positive change from a higher after-hours price', () => {
    const result = estimateNextOpen(
      quote({
        regularMarketPreviousClose: 100,
        postMarketPrice: 105,
        regularMarketDayHigh: 101,
        regularMarketDayLow: 99,
      }),
    );
    expect(result.available).toBe(true);
    expect(result.gapDirection).toBe(GapDirection.UP);
    expect(result.estimatedChangePercent).toBeCloseTo(5, 2);
  });

  it('computes a DOWN gap direction from a lower after-hours price', () => {
    const result = estimateNextOpen(
      quote({
        regularMarketPreviousClose: 100,
        postMarketPrice: 95,
        regularMarketDayHigh: 101,
        regularMarketDayLow: 99,
      }),
    );
    expect(result.gapDirection).toBe(GapDirection.DOWN);
  });

  it('computes a FLAT gap direction within the threshold', () => {
    const result = estimateNextOpen(
      quote({
        regularMarketPreviousClose: 100,
        postMarketPrice: 100.05,
        regularMarketDayHigh: 101,
        regularMarketDayLow: 99,
      }),
    );
    expect(result.gapDirection).toBe(GapDirection.FLAT);
  });

  it('falls back to pre-market price when post-market is unavailable', () => {
    const result = estimateNextOpen(
      quote({ regularMarketPreviousClose: 100, preMarketPrice: 103 }),
    );
    expect(result.available).toBe(true);
    expect(result.gapDirection).toBe(GapDirection.UP);
  });

  it('applies a minimum half-width even with a tiny trading range', () => {
    const result = estimateNextOpen(
      quote({
        regularMarketPreviousClose: 100,
        postMarketPrice: 100,
        regularMarketDayHigh: 100.01,
        regularMarketDayLow: 100,
      }),
    );
    expect(result.available).toBe(true);
    const low = result.lowEstimate as number;
    const high = result.highEstimate as number;
    expect(high - low).toBeGreaterThan(0);
  });
});
