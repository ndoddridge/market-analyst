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
    const results = await this.scannerService.scan({ profile });

    if (results.length === 0) {
      throw new ServiceUnavailableException(
        'Market today is unavailable because the scanner returned no results.',
      );
    }

    const ranked = this.rankForProfile(results, profile);
    const topOpportunity = this.toPick(ranked[0]);
    const topRisk = this.toPick(ranked[ranked.length - 1]);
    const marketDirection = this.resolveMarketDirection(ranked);
    const catalyst = await this.resolveCatalyst(
      profile,
      topOpportunity,
      topRisk,
    );
    const summary = this.buildSummary(
      profile,
      marketDirection,
      topOpportunity,
      topRisk,
      catalyst,
    );

    return {
      profile,
      marketDirection,
      topOpportunity,
      topRisk,
      catalyst,
      summary,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Profile-aware ranking on top of scanner scores:
   * SHORT_TERM favors nearer holding windows; LONG_TERM favors multi-month windows.
   */
  private rankForProfile(
    results: ScannerResult[],
    profile: AnalysisProfile,
  ): ScannerResult[] {
    return [...results].sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const aDays = a.suggestedHoldingWindow.maxDays;
      const bDays = b.suggestedHoldingWindow.maxDays;

      if (profile === AnalysisProfile.SHORT_TERM) {
        return aDays - bDays;
      }

      return bDays - aDays;
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

  private async resolveCatalyst(
    profile: AnalysisProfile,
    topOpportunity: MarketTodayPick,
    topRisk: MarketTodayPick,
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
      profile,
      events,
      topOpportunity.ticker,
      topRisk.ticker,
    );
    if (eventCatalyst) {
      return eventCatalyst;
    }

    return this.pickNewsCatalyst(
      profile,
      news,
      topOpportunity.ticker,
      topRisk.ticker,
    );
  }

  private pickEventCatalyst(
    profile: AnalysisProfile,
    events: MarketEvent[],
    opportunityTicker: string,
    riskTicker: string,
  ): MarketTodayCatalyst | null {
    const now = Date.now();
    const filtered = events.filter((event) => {
      const ts = new Date(event.eventDate).getTime();
      if (Number.isNaN(ts)) {
        return false;
      }

      const daysAhead = (ts - now) / DAY_MS;

      if (profile === AnalysisProfile.SHORT_TERM) {
        // Next few trading days (~2 weeks calendar).
        return daysAhead >= -1 && daysAhead <= 14;
      }

      // Multi-month opportunity window.
      return daysAhead >= 30 && daysAhead <= 365;
    });

    if (filtered.length === 0) {
      return null;
    }

    const preferred =
      filtered.find((event) => event.ticker === opportunityTicker) ??
      filtered.find((event) => event.ticker === riskTicker) ??
      filtered[0];

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
    riskTicker: string,
  ): MarketTodayCatalyst | null {
    const now = Date.now();
    const maxAgeDays = profile === AnalysisProfile.SHORT_TERM ? 3 : 30;

    const filtered = news.filter((item) => {
      const ts = new Date(item.publishedAt).getTime();
      if (Number.isNaN(ts)) {
        return false;
      }
      return now - ts <= maxAgeDays * DAY_MS;
    });

    if (filtered.length === 0) {
      return null;
    }

    const preferred =
      filtered.find((item) =>
        item.relatedTickers.includes(opportunityTicker),
      ) ??
      filtered.find((item) => item.relatedTickers.includes(riskTicker)) ??
      filtered[0];

    return {
      type: CatalystType.NEWS,
      headline: preferred.title,
      ticker:
        preferred.relatedTickers.find((ticker) =>
          [opportunityTicker, riskTicker, 'SPY', 'QQQ'].includes(ticker),
        ) ??
        preferred.relatedTickers[0] ??
        null,
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
