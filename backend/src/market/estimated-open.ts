import { GapDirection, type EstimatedOpen } from './types/estimated-open';
import type { ExtendedQuote } from './types/extended-quote';

const MIN_HALF_WIDTH_PCT = 0.15;
const GAP_THRESHOLD_PCT = 0.15;

const UNAVAILABLE: EstimatedOpen = {
  available: false,
  lowEstimate: null,
  highEstimate: null,
  estimatedChangePercent: null,
  gapDirection: null,
  method: null,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Range estimate for the next session's open — never a single guaranteed
 * price. Only available when both a previous close and an extended-hours
 * price exist; otherwise returns the unavailable sentinel without
 * fabricating a number.
 */
export function estimateNextOpen(quote: ExtendedQuote): EstimatedOpen {
  const previousClose = quote.regularMarketPreviousClose;
  // Prefer the after-hours price (predicts the next session); fall back to
  // pre-market when that's what's available instead.
  const center = quote.postMarketPrice ?? quote.preMarketPrice ?? null;

  if (
    previousClose == null ||
    previousClose <= 0 ||
    center == null ||
    center <= 0
  ) {
    return UNAVAILABLE;
  }

  const { regularMarketDayHigh: dayHigh, regularMarketDayLow: dayLow } = quote;
  let halfWidthPct = MIN_HALF_WIDTH_PCT;
  if (dayHigh != null && dayLow != null && dayHigh > dayLow) {
    const rangePct = ((dayHigh - dayLow) / previousClose) * 100;
    halfWidthPct = Math.max(MIN_HALF_WIDTH_PCT, rangePct / 2);
  }

  const halfWidth = center * (halfWidthPct / 100);
  const estimatedChangePercent = round2(
    ((center - previousClose) / previousClose) * 100,
  );

  let gapDirection: GapDirection;
  if (estimatedChangePercent > GAP_THRESHOLD_PCT) {
    gapDirection = GapDirection.UP;
  } else if (estimatedChangePercent < -GAP_THRESHOLD_PCT) {
    gapDirection = GapDirection.DOWN;
  } else {
    gapDirection = GapDirection.FLAT;
  }

  return {
    available: true,
    lowEstimate: round2(center - halfWidth),
    highEstimate: round2(center + halfWidth),
    estimatedChangePercent,
    gapDirection,
    method:
      "Estimated from Yahoo Finance's extended-hours quote and today's trading range; not a guaranteed price.",
  };
}
