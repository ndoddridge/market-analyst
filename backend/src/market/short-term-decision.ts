import { Recommendation } from '../analysis/types/analysis-result';
import type { MarketEvent } from '../events/types/market-event';
import type { NewsItem } from '../news/types/news-item';
import type { ScannerResult } from '../scanner/types/scanner-result';
import { marketCalendarDaysBetween } from '../shared/market-clock';
import { isNewsRelevantToTicker, scoreNewsCatalyst } from './catalyst-relevance';
import {
  CatalystType,
  type MarketTodayCatalyst,
  type MarketTodayPick,
} from './types/market-today';

const DAY_MS = 24 * 60 * 60 * 1000;
const NEAR_TERM_MAX_DAYS = 5;
const SHORT_NEWS_MAX_AGE_DAYS = 3;

/** Minimum action score required to keep/force a BUY for the next 1–5 sessions. */
export const SHORT_TERM_BUY_THRESHOLD = 70;

export type ShortTermDecision = {
  topOpportunity: MarketTodayPick;
  topRisk: MarketTodayPick;
  catalyst: MarketTodayCatalyst | null;
  reason: string;
  /** Internal actionability score for tests/debug (not API). */
  actionScore: number;
};

type RankedCandidate = {
  result: ScannerResult;
  actionScore: number;
  catalyst: MarketTodayCatalyst | null;
  reason: string;
  presentationRecommendation: Recommendation;
};

function eventDaysAhead(event: MarketEvent, now: Date): number | null {
  const ts = new Date(event.eventDate).getTime();
  if (Number.isNaN(ts)) {
    return null;
  }
  return (ts - now.getTime()) / DAY_MS;
}

function pickTickerEventCatalyst(
  events: readonly MarketEvent[],
  ticker: string,
  now: Date,
): { catalyst: MarketTodayCatalyst | null; boost: number; note: string | null } {
  const tickerEvents = events.filter(
    (event) => event.ticker.toUpperCase() === ticker.toUpperCase(),
  );

  let best:
    | {
        event: MarketEvent;
        daysAhead: number;
        boost: number;
        note: string;
      }
    | null = null;

  for (const event of tickerEvents) {
    const daysAhead = eventDaysAhead(event, now);
    if (daysAhead == null) {
      continue;
    }

    // Already-passed catalysts are penalized and never treated as supportive.
    if (daysAhead < -0.5) {
      if (!best || best.boost < -20) {
        best = {
          event,
          daysAhead,
          boost: -25,
          note: `penalized passed catalyst (${event.title})`,
        };
      }
      continue;
    }

    // Strongest: relevant upcoming catalyst inside the 1–5 trading-day window.
    if (daysAhead <= NEAR_TERM_MAX_DAYS) {
      const boost = 28 - daysAhead * 2;
      if (!best || boost > best.boost) {
        best = {
          event,
          daysAhead,
          boost,
          note: `upcoming catalyst within 1–5 sessions (${event.title})`,
        };
      }
      continue;
    }

    // Later but still near-term (6–14d): mild support only.
    if (daysAhead <= 14) {
      const boost = 8;
      if (!best || boost > best.boost) {
        best = {
          event,
          daysAhead,
          boost,
          note: `later near-term catalyst (${event.title})`,
        };
      }
    }
  }

  if (!best || best.boost <= 0) {
    return { catalyst: null, boost: best?.boost ?? 0, note: best?.note ?? null };
  }

  return {
    catalyst: {
      type: CatalystType.EVENT,
      headline: best.event.title,
      ticker: best.event.ticker,
      date: best.event.eventDate,
      source: best.event.provider,
    },
    boost: best.boost,
    note: best.note,
  };
}

function pickTickerNewsCatalyst(
  news: readonly NewsItem[],
  ticker: string,
  now: Date,
): { catalyst: MarketTodayCatalyst | null; boost: number; note: string | null } {
  const candidates = news
    .filter((item) => {
      const published = new Date(item.publishedAt);
      if (Number.isNaN(published.getTime())) {
        return false;
      }
      if (marketCalendarDaysBetween(published, now) > SHORT_NEWS_MAX_AGE_DAYS) {
        return false;
      }
      return isNewsRelevantToTicker(item, ticker);
    })
    .map((item) => ({
      item,
      score: scoreNewsCatalyst(item, ticker, now),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  const top = candidates[0];
  if (!top) {
    // Explicitly ignore irrelevant headlines so they cannot improve ranking.
    const hadIrrelevant = news.some((item) => item.querySymbol === ticker);
    return {
      catalyst: null,
      boost: hadIrrelevant ? 0 : 0,
      note: null,
    };
  }

  return {
    catalyst: {
      type: CatalystType.NEWS,
      headline: top.item.title,
      ticker,
      date: top.item.publishedAt,
      source: top.item.provider,
    },
    boost: Math.min(18, 8 + top.score / 10),
    note: `relevant recent catalyst (${top.item.title})`,
  };
}

function recommendationSetupBoost(recommendation: Recommendation): number {
  switch (recommendation) {
    case Recommendation.BUY:
      return 16;
    case Recommendation.WATCH:
      return 10;
    case Recommendation.HOLD:
      return 0;
    case Recommendation.SELL:
      return -22;
  }
}

function holdingWindowBoost(result: ScannerResult): number {
  const { minDays, maxDays } = result.suggestedHoldingWindow;
  if (maxDays <= 0) {
    return -8;
  }
  // Prefer setups aligned to the next 1–5 trading days.
  if (minDays <= NEAR_TERM_MAX_DAYS && maxDays <= NEAR_TERM_MAX_DAYS) {
    return 12;
  }
  if (maxDays <= 15) {
    return 5;
  }
  return 0;
}

/**
 * Momentum/trend proxy from the existing scanner score + confidence.
 * Does not invent new market signals.
 */
function momentumTrendBoost(result: ScannerResult): number {
  return result.score * 0.35 + result.confidence * 12;
}

function resolvePresentationRecommendation(
  result: ScannerResult,
  actionScore: number,
): Recommendation {
  if (result.recommendation === Recommendation.SELL) {
    return Recommendation.SELL;
  }

  // Keep BUY only when the combined short-term evidence clears the bar.
  if (
    result.recommendation === Recommendation.BUY &&
    actionScore >= SHORT_TERM_BUY_THRESHOLD
  ) {
    return Recommendation.BUY;
  }

  // Not enough evidence for a forced BUY over the next 1–5 sessions.
  if (
    result.recommendation === Recommendation.BUY ||
    result.recommendation === Recommendation.WATCH ||
    result.recommendation === Recommendation.HOLD
  ) {
    return Recommendation.WATCH;
  }

  return result.recommendation;
}

function buildReason(
  result: ScannerResult,
  presentationRecommendation: Recommendation,
  catalystNote: string | null,
  hasSupportiveCatalyst: boolean,
): string {
  if (catalystNote && hasSupportiveCatalyst) {
    if (presentationRecommendation === Recommendation.BUY) {
      return `${result.ticker} wins on near-term setup with ${catalystNote} and supportive scanner momentum (score ${result.score}).`;
    }
    return `${result.ticker} leads on near-term evidence with ${catalystNote}, but conviction stays WATCH/WAIT.`;
  }

  if (presentationRecommendation === Recommendation.WATCH) {
    return `${result.ticker} is the best available near-term candidate, but evidence is insufficient for BUY so the setup stays WATCH/WAIT.`;
  }

  return `${result.ticker} ranks highest on scanner momentum/trend for the next 1–5 sessions.`;
}

export function evaluateShortTermCandidate(
  result: ScannerResult,
  news: readonly NewsItem[],
  events: readonly MarketEvent[],
  now: Date = new Date(),
): RankedCandidate {
  const eventPick = pickTickerEventCatalyst(events, result.ticker, now);
  const newsPick = pickTickerNewsCatalyst(news, result.ticker, now);

  // Prefer actionable upcoming events over news headlines.
  const catalyst =
    eventPick.boost > 0 && eventPick.catalyst
      ? eventPick.catalyst
      : newsPick.catalyst;
  const catalystBoost =
    eventPick.boost > 0 ? eventPick.boost : Math.max(0, newsPick.boost);
  const catalystNote =
    eventPick.boost > 0 ? eventPick.note : newsPick.note;
  const hasSupportiveCatalyst = catalystBoost > 0 && catalyst != null;

  // Passed-event penalty still applies even when no supportive catalyst remains.
  const penalty = eventPick.boost < 0 ? eventPick.boost : 0;

  const actionScore =
    momentumTrendBoost(result) +
    recommendationSetupBoost(result.recommendation) +
    holdingWindowBoost(result) +
    catalystBoost +
    penalty;

  const presentationRecommendation = resolvePresentationRecommendation(
    result,
    actionScore,
  );

  return {
    result,
    actionScore,
    catalyst: hasSupportiveCatalyst ? catalyst : null,
    reason: buildReason(
      result,
      presentationRecommendation,
      catalystNote,
      hasSupportiveCatalyst,
    ),
    presentationRecommendation,
  };
}

/**
 * SHORT_TERM opportunity selection for the next 1–5 trading days.
 * Does not simply choose the highest scanner score.
 */
export function decideShortTermOpportunity(
  results: readonly ScannerResult[],
  news: readonly NewsItem[],
  events: readonly MarketEvent[],
  now: Date = new Date(),
): ShortTermDecision {
  if (results.length === 0) {
    throw new Error('Cannot decide short-term opportunity without scanner results');
  }

  const ranked = results
    .map((result) => evaluateShortTermCandidate(result, news, events, now))
    .sort((a, b) => {
      if (b.actionScore !== a.actionScore) {
        return b.actionScore - a.actionScore;
      }
      // Stable tie-breaker only; score is not the primary selector.
      return b.result.score - a.result.score;
    });

  const winner = ranked[0];
  const risk = [...results].sort((a, b) => a.score - b.score)[0];

  return {
    topOpportunity: {
      ticker: winner.result.ticker,
      recommendation: winner.presentationRecommendation,
      score: winner.result.score,
    },
    topRisk: {
      ticker: risk.ticker,
      recommendation: risk.recommendation,
      score: risk.score,
    },
    catalyst: winner.catalyst,
    reason: winner.reason,
    actionScore: winner.actionScore,
  };
}
