import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { Recommendation } from '../analysis/types/analysis-result';
import type { MarketEvent } from '../events/types/market-event';
import type { NewsItem } from '../news/types/news-item';
import type { ScannerResult } from '../scanner/types/scanner-result';
import { marketCalendarDaysBetween } from '../shared/market-clock';
import { scoreNewsCatalyst } from './catalyst-relevance';
import {
  CatalystType,
  SetupQuality,
  TodayAction,
  type MarketTodayCatalyst,
} from './types/market-today';

const DAY_MS = 24 * 60 * 60 * 1000;

export type LongTermCandidate = {
  result: ScannerResult;
  catalyst: MarketTodayCatalyst | null;
  setupQuality: SetupQuality;
  presentationRecommendation: TodayAction;
};

export function recommendationToTodayAction(
  recommendation: Recommendation,
): TodayAction {
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

/**
 * LONG_TERM ranking: unchanged score ordering, tie-broken by the longer
 * suggested holding window. Does not simply choose the highest scanner score
 * alone when scores tie.
 */
export function rankForLongTerm(results: ScannerResult[]): ScannerResult[] {
  return [...results].sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return b.suggestedHoldingWindow.maxDays - a.suggestedHoldingWindow.maxDays;
  });
}

export function pickEventCatalyst(
  profile: AnalysisProfile,
  events: readonly MarketEvent[],
  opportunityTicker: string,
  now: Date,
): MarketTodayCatalyst | null {
  const filtered = events.filter((event) => {
    const ts = new Date(event.eventDate).getTime();
    if (Number.isNaN(ts)) {
      return false;
    }

    const daysAhead = (ts - now.getTime()) / DAY_MS;

    if (profile === AnalysisProfile.SHORT_TERM) {
      return daysAhead >= -1 && daysAhead <= 14;
    }

    return daysAhead >= 30 && daysAhead <= 365;
  });

  const preferred =
    filtered.find((event) => event.ticker === opportunityTicker) ?? null;

  if (!preferred) {
    return null;
  }

  return {
    type: CatalystType.EVENT,
    headline: preferred.title,
    ticker: preferred.ticker,
    date: preferred.eventDate,
    source: preferred.provider,
  };
}

export function pickNewsCatalyst(
  profile: AnalysisProfile,
  news: readonly NewsItem[],
  opportunityTicker: string,
  now: Date,
): MarketTodayCatalyst | null {
  const maxAgeDays = profile === AnalysisProfile.SHORT_TERM ? 3 : 30;

  const candidates = news
    .filter((item) => {
      const published = new Date(item.publishedAt);
      if (Number.isNaN(published.getTime())) {
        return false;
      }
      return marketCalendarDaysBetween(published, now) <= maxAgeDays;
    })
    .map((item) => ({
      item,
      score: scoreNewsCatalyst(item, opportunityTicker, now),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  const preferred = candidates[0]?.item;
  if (!preferred) {
    return null;
  }

  return {
    type: CatalystType.NEWS,
    headline: preferred.title,
    ticker: opportunityTicker,
    date: preferred.publishedAt,
    source: preferred.provider,
  };
}

function resolveLongTermSetupQuality(
  score: number,
  catalyst: MarketTodayCatalyst | null,
): SetupQuality {
  if (score >= 75 && catalyst != null) {
    return SetupQuality.STRONG;
  }
  if (score >= 55) {
    return SetupQuality.MODERATE;
  }
  return SetupQuality.WEAK;
}

/**
 * Personalized LONG_TERM evaluation for a single ticker (portfolio use).
 * Simpler than the SHORT_TERM engine — no 1–5 day catalyst-window gating,
 * since LONG_TERM catalysts already use a 30–365 day window (see
 * pickEventCatalyst/pickNewsCatalyst above).
 */
export function evaluateLongTermCandidate(
  result: ScannerResult,
  news: readonly NewsItem[],
  events: readonly MarketEvent[],
  now: Date = new Date(),
): LongTermCandidate {
  const eventCatalyst = pickEventCatalyst(
    AnalysisProfile.LONG_TERM,
    events,
    result.ticker,
    now,
  );
  const catalyst =
    eventCatalyst ??
    pickNewsCatalyst(AnalysisProfile.LONG_TERM, news, result.ticker, now);

  return {
    result,
    catalyst,
    setupQuality: resolveLongTermSetupQuality(result.score, catalyst),
    presentationRecommendation: recommendationToTodayAction(
      result.recommendation,
    ),
  };
}
