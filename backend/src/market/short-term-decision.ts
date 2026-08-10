import { Recommendation } from '../analysis/types/analysis-result';
import type { MarketEvent } from '../events/types/market-event';
import type { NewsItem } from '../news/types/news-item';
import type { ScannerResult } from '../scanner/types/scanner-result';
import { marketCalendarDaysBetween } from '../shared/market-clock';
import {
  hasMarketMovingLanguage,
  scoreShortTermNewsCatalyst,
  SHORT_TERM_NEWS_BOOST_MIN_SCORE,
} from './short-term-catalyst';
import {
  CatalystType,
  SetupQuality,
  TodayAction,
  type DecisionEvidence,
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
  decision: DecisionEvidence;
  reason: string;
  /** Internal actionability score for tests/debug (not API). */
  actionScore: number;
};

type CatalystPick = {
  catalyst: MarketTodayCatalyst | null;
  /** Ranking boost used by existing short-term selection. */
  boost: number;
  /** Explainability score 0–100; 0 means no usable catalyst. */
  catalystScore: number;
  note: string | null;
};

export type RankedCandidate = {
  result: ScannerResult;
  actionScore: number;
  catalyst: MarketTodayCatalyst | null;
  catalystScore: number;
  catalystNote: string | null;
  setupQuality: SetupQuality;
  presentationRecommendation: TodayAction;
};

function eventDaysAhead(event: MarketEvent, now: Date): number | null {
  const ts = new Date(event.eventDate).getTime();
  if (Number.isNaN(ts)) {
    return null;
  }
  return (ts - now.getTime()) / DAY_MS;
}

function eventCatalystScore(daysAhead: number, boost: number): number {
  if (boost <= 0) {
    return 0;
  }
  // Major company event inside 1–5 sessions → high.
  if (daysAhead <= NEAR_TERM_MAX_DAYS) {
    return Math.min(100, Math.round(82 + Math.max(0, 28 - daysAhead * 2)));
  }
  // Later near-term (6–14d) → moderate / lower.
  return 48;
}

function newsCatalystScore(rawScore: number, title: string): number {
  if (rawScore < SHORT_TERM_NEWS_BOOST_MIN_SCORE) {
    return 0;
  }

  // Broad/indirect market language without a company-specific hook → low band.
  if (hasMarketMovingLanguage(title) && rawScore < 90) {
    return Math.min(45, Math.max(20, Math.round(rawScore * 0.35)));
  }

  // Major company-specific substance / direct impact → high.
  if (rawScore >= 100) {
    return Math.min(100, Math.round(78 + Math.min(22, (rawScore - 100) / 4)));
  }

  // Relevant but less consequential → moderate.
  if (rawScore >= 55) {
    return Math.min(72, Math.max(46, Math.round(40 + rawScore * 0.25)));
  }

  // Weakly related accepted news → low (ranking boost stays on existing formula).
  return Math.min(35, Math.max(10, Math.round(rawScore * 0.4)));
}

function pickTickerEventCatalyst(
  events: readonly MarketEvent[],
  ticker: string,
  now: Date,
): CatalystPick {
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
    return {
      catalyst: null,
      boost: best?.boost ?? 0,
      catalystScore: 0,
      note: best?.note ?? null,
    };
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
    catalystScore: eventCatalystScore(best.daysAhead, best.boost),
    note: best.note,
  };
}

function pickTickerNewsCatalyst(
  news: readonly NewsItem[],
  ticker: string,
  now: Date,
): CatalystPick {
  const candidates = news
    .filter((item) => {
      const published = new Date(item.publishedAt);
      if (Number.isNaN(published.getTime())) {
        return false;
      }
      if (marketCalendarDaysBetween(published, now) > SHORT_NEWS_MAX_AGE_DAYS) {
        return false;
      }
      return true;
    })
    .map((item) => ({
      item,
      score: scoreShortTermNewsCatalyst(item, ticker, now),
    }))
    // Only meaningful 1–5 day catalysts; weak/any recent news must not boost.
    .filter((entry) => entry.score >= SHORT_TERM_NEWS_BOOST_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const top = candidates[0];
  if (!top) {
    return {
      catalyst: null,
      boost: 0,
      catalystScore: 0,
      note: null,
    };
  }

  const catalystScore = newsCatalystScore(top.score, top.item.title);

  return {
    catalyst: {
      type: CatalystType.NEWS,
      headline: top.item.title,
      ticker,
      date: top.item.publishedAt,
      source: top.item.provider,
    },
    // Keep prior ranking boost formula unchanged.
    boost: Math.min(18, 8 + top.score / 10),
    catalystScore,
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

export function resolveSetupQuality(
  signalScore: number,
  catalystScore: number,
  actionScore: number,
): SetupQuality {
  if (
    signalScore >= 75 &&
    catalystScore >= 70 &&
    actionScore >= SHORT_TERM_BUY_THRESHOLD
  ) {
    return SetupQuality.STRONG;
  }

  if (signalScore >= 55 || catalystScore >= 40) {
    return SetupQuality.MODERATE;
  }

  return SetupQuality.WEAK;
}

function resolvePresentationRecommendation(
  result: ScannerResult,
  actionScore: number,
  setupQuality: SetupQuality,
): TodayAction {
  if (result.recommendation === Recommendation.SELL) {
    return TodayAction.SELL;
  }

  // BUY only when combined evidence supports a strong near-term setup.
  if (
    result.recommendation === Recommendation.BUY &&
    setupQuality === SetupQuality.STRONG &&
    actionScore >= SHORT_TERM_BUY_THRESHOLD
  ) {
    return TodayAction.BUY;
  }

  if (setupQuality === SetupQuality.WEAK) {
    return TodayAction.WAIT;
  }

  // Interesting but conviction is insufficient for BUY.
  return TodayAction.WATCH;
}

function buildReason(options: {
  ticker: string;
  signalScore: number;
  catalystScore: number;
  setupQuality: SetupQuality;
  action: TodayAction;
  catalystNote: string | null;
  riskTicker: string | null;
}): string {
  const {
    ticker,
    signalScore,
    catalystScore,
    setupQuality,
    action,
    catalystNote,
    riskTicker,
  } = options;

  const riskBit = riskTicker
    ? ` ${riskTicker} remains the weakest scanner score.`
    : '';

  if (action === TodayAction.BUY && catalystNote) {
    return `${ticker} ranks first on a strong setup: scanner score ${signalScore} with catalyst strength ${catalystScore}/100 (${catalystNote}).${riskBit}`;
  }

  if (catalystNote && catalystScore > 0) {
    return `${ticker} leads with scanner score ${signalScore} and catalyst strength ${catalystScore}/100 (${catalystNote}), but conviction stays ${action}.${riskBit}`;
  }

  if (action === TodayAction.WAIT) {
    return `${ticker} is the best available near-term name (scanner score ${signalScore}), but evidence is weak/unclear so the setup stays WAIT.${riskBit}`;
  }

  if (action === TodayAction.WATCH) {
    return `${ticker} is interesting on scanner score ${signalScore} (${setupQuality.toLowerCase()} setup), but conviction is insufficient for BUY so it stays WATCH.${riskBit}`;
  }

  return `${ticker} ranks highest on scanner momentum/trend for the next 1–5 sessions (score ${signalScore}).${riskBit}`;
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
  const useEvent = eventPick.boost > 0 && eventPick.catalyst != null;
  const catalyst = useEvent ? eventPick.catalyst : newsPick.catalyst;
  const catalystBoost = useEvent
    ? eventPick.boost
    : Math.max(0, newsPick.boost);
  const catalystScore = useEvent
    ? eventPick.catalystScore
    : newsPick.catalystScore;
  const catalystNote = useEvent ? eventPick.note : newsPick.note;
  const hasSupportiveCatalyst =
    catalystBoost > 0 && catalyst != null && catalystScore > 0;

  // Passed-event penalty still applies even when no supportive catalyst remains.
  const penalty = eventPick.boost < 0 ? eventPick.boost : 0;

  const actionScore =
    momentumTrendBoost(result) +
    recommendationSetupBoost(result.recommendation) +
    holdingWindowBoost(result) +
    catalystBoost +
    penalty;

  const effectiveCatalystScore = hasSupportiveCatalyst ? catalystScore : 0;
  const setupQuality = resolveSetupQuality(
    result.score,
    effectiveCatalystScore,
    actionScore,
  );

  const presentationRecommendation = resolvePresentationRecommendation(
    result,
    actionScore,
    setupQuality,
  );

  return {
    result,
    actionScore,
    catalyst: hasSupportiveCatalyst ? catalyst : null,
    catalystScore: effectiveCatalystScore,
    catalystNote: hasSupportiveCatalyst ? catalystNote : null,
    setupQuality,
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
  const riskTicker =
    risk.ticker === winner.result.ticker ? null : risk.ticker;

  const reason = buildReason({
    ticker: winner.result.ticker,
    signalScore: winner.result.score,
    catalystScore: winner.catalystScore,
    setupQuality: winner.setupQuality,
    action: winner.presentationRecommendation,
    catalystNote: winner.catalystNote,
    riskTicker,
  });

  const decision: DecisionEvidence = {
    signalScore: winner.result.score,
    catalystScore: winner.catalystScore,
    setupQuality: winner.setupQuality,
    reason,
  };

  return {
    topOpportunity: {
      ticker: winner.result.ticker,
      recommendation: winner.presentationRecommendation,
      score: winner.result.score,
    },
    topRisk: {
      ticker: risk.ticker,
      recommendation: toTodayAction(risk.recommendation),
      score: risk.score,
    },
    catalyst: winner.catalyst,
    decision,
    reason,
    actionScore: winner.actionScore,
  };
}

function toTodayAction(recommendation: Recommendation): TodayAction {
  switch (recommendation) {
    case Recommendation.BUY:
      return TodayAction.BUY;
    case Recommendation.WATCH:
      return TodayAction.WATCH;
    case Recommendation.HOLD:
      return TodayAction.HOLD;
    case Recommendation.SELL:
      return TodayAction.SELL;
  }
}
