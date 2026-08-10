import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AnalysisProfile,
  DEFAULT_ANALYSIS_PROFILE,
} from '../analysis/types/analysis-profile';
import { Recommendation } from '../analysis/types/analysis-result';
import { EventsService } from '../events/events.service';
import type { MarketEvent } from '../events/types/market-event';
import { NewsService } from '../news/news.service';
import type { NewsItem } from '../news/types/news-item';
import { ScannerService } from '../scanner/scanner.service';
import type { ScannerResult } from '../scanner/types/scanner-result';
import {
  marketCalendarDaysBetween,
  toMarketIsoString,
} from '../shared/market-clock';
import { scoreNewsCatalyst } from './catalyst-relevance';
import { decideShortTermOpportunity } from './short-term-decision';
import {
  CatalystType,
  MarketDirection,
  type MarketTodayCatalyst,
  type MarketTodayPick,
  type MarketTodayResult,
} from './types/market-today';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MarketTodayService {
  constructor(
    private readonly scannerService: ScannerService,
    private readonly newsService: NewsService,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Concise "Today's Move" intelligence from the shared scanner + catalyst pipeline.
   */
  async getToday(
    profile: AnalysisProfile = DEFAULT_ANALYSIS_PROFILE,
  ): Promise<MarketTodayResult> {
    const now = new Date();
    const results = await this.scannerService.scan({ profile });

    if (results.length === 0) {
      throw new ServiceUnavailableException(
        'Market today is unavailable because the scanner returned no results.',
      );
    }

    if (profile === AnalysisProfile.SHORT_TERM) {
      return this.buildShortTermToday(results, now);
    }

    return this.buildLongTermToday(results, now);
  }

  /**
   * SHORT_TERM: rank by scanner signals + relevant catalysts (not raw score alone).
   */
  private async buildShortTermToday(
    results: ScannerResult[],
    now: Date,
  ): Promise<MarketTodayResult> {
    const focusTickers = [...new Set(results.map((result) => result.ticker))];
    const [events, news] = await Promise.all([
      this.eventsService.getUpcomingEvents(focusTickers),
      this.newsService.getRecentNews(focusTickers),
    ]);

    const decision = decideShortTermOpportunity(results, news, events, now);
    const marketDirection = this.resolveMarketDirection(results);
    const summary = this.buildSummary(
      AnalysisProfile.SHORT_TERM,
      marketDirection,
      decision.topOpportunity,
      decision.topRisk,
      decision.catalyst,
    );

    return {
      profile: AnalysisProfile.SHORT_TERM,
      marketDirection,
      topOpportunity: decision.topOpportunity,
      topRisk: decision.topRisk,
      catalyst: decision.catalyst,
      reason: decision.reason,
      summary,
      generatedAt: toMarketIsoString(now),
    };
  }

  /**
   * LONG_TERM: unchanged score/window ranking + post-pick catalyst resolution.
   */
  private async buildLongTermToday(
    results: ScannerResult[],
    now: Date,
  ): Promise<MarketTodayResult> {
    const ranked = this.rankForLongTerm(results);
    const topOpportunity = this.toPick(ranked[0]);
    const topRisk = this.toPick(ranked[ranked.length - 1]);
    const marketDirection = this.resolveMarketDirection(ranked);
    const catalyst = await this.resolveLongTermCatalyst(
      topOpportunity,
      topRisk,
      now,
    );
    const reason = `${topOpportunity.ticker} leads on LONG_TERM scanner score (${topOpportunity.score}) with a multi-month holding window.`;
    const summary = this.buildSummary(
      AnalysisProfile.LONG_TERM,
      marketDirection,
      topOpportunity,
      topRisk,
      catalyst,
    );

    return {
      profile: AnalysisProfile.LONG_TERM,
      marketDirection,
      topOpportunity,
      topRisk,
      catalyst,
      reason,
      summary,
      generatedAt: toMarketIsoString(now),
    };
  }

  private rankForLongTerm(results: ScannerResult[]): ScannerResult[] {
    return [...results].sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return (
        b.suggestedHoldingWindow.maxDays - a.suggestedHoldingWindow.maxDays
      );
    });
  }

  private toPick(result: ScannerResult): MarketTodayPick {
    return {
      ticker: result.ticker,
      recommendation: result.recommendation,
      score: result.score,
    };
  }

  private resolveMarketDirection(results: ScannerResult[]): MarketDirection {
    let bullish = 0;
    let bearish = 0;

    for (const result of results) {
      if (
        result.recommendation === Recommendation.BUY ||
        result.recommendation === Recommendation.WATCH
      ) {
        bullish += 1;
      } else if (result.recommendation === Recommendation.SELL) {
        bearish += 1;
      }
    }

    if (bullish > bearish) {
      return MarketDirection.BULLISH;
    }
    if (bearish > bullish) {
      return MarketDirection.BEARISH;
    }
    return MarketDirection.NEUTRAL;
  }

  private async resolveLongTermCatalyst(
    topOpportunity: MarketTodayPick,
    topRisk: MarketTodayPick,
    now: Date,
  ): Promise<MarketTodayCatalyst | null> {
    const focusTickers = [
      ...new Set([
        topOpportunity.ticker,
        topRisk.ticker,
        'SPY',
        'QQQ',
      ]),
    ];

    const [events, news] = await Promise.all([
      this.eventsService.getUpcomingEvents(focusTickers),
      this.newsService.getRecentNews(focusTickers),
    ]);

    const eventCatalyst = this.pickEventCatalyst(
      AnalysisProfile.LONG_TERM,
      events,
      topOpportunity.ticker,
      now,
    );
    if (eventCatalyst) {
      return eventCatalyst;
    }

    return this.pickNewsCatalyst(
      AnalysisProfile.LONG_TERM,
      news,
      topOpportunity.ticker,
      now,
    );
  }

  private pickEventCatalyst(
    profile: AnalysisProfile,
    events: MarketEvent[],
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

  private pickNewsCatalyst(
    profile: AnalysisProfile,
    news: NewsItem[],
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

  private buildSummary(
    profile: AnalysisProfile,
    marketDirection: MarketDirection,
    topOpportunity: MarketTodayPick,
    topRisk: MarketTodayPick,
    catalyst: MarketTodayCatalyst | null,
  ): string {
    const horizon =
      profile === AnalysisProfile.SHORT_TERM
        ? 'the next few trading days'
        : 'multi-month opportunities';
    const setup =
      `${profile} setup is ${marketDirection} for ${horizon}: ` +
      `${topOpportunity.ticker} (${topOpportunity.recommendation}, score ${topOpportunity.score}) ` +
      `leads while ${topRisk.ticker} (${topRisk.recommendation}, score ${topRisk.score}) is the weakest.`;

    if (!catalyst) {
      return `${setup} No confirmed news or event catalyst is available.`;
    }

    return `${setup} Catalyst: ${catalyst.headline} (${catalyst.source}).`;
  }
}
