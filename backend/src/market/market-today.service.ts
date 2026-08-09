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

@Injectable()
export class MarketTodayService {
  constructor(
    private readonly scannerService: ScannerService,
    private readonly newsService: NewsService,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Concise "Today's Move" view built from the shared scanner pipeline.
   * Reusable for SHORT_TERM / LONG_TERM (and later notifications).
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

    const topOpportunity = this.toPick(results[0]);
    const topRisk = this.toPick(results[results.length - 1]);
    const marketDirection = this.resolveMarketDirection(results);
    const catalyst = await this.resolveCatalyst(topOpportunity, topRisk);
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
    return MarketDirection.MIXED;
  }

  private async resolveCatalyst(
    topOpportunity: MarketTodayPick,
    topRisk: MarketTodayPick,
  ): Promise<MarketTodayCatalyst> {
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
      events,
      topOpportunity.ticker,
      topRisk.ticker,
    );
    if (eventCatalyst) {
      return eventCatalyst;
    }

    const newsCatalyst = this.pickNewsCatalyst(
      news,
      topOpportunity.ticker,
      topRisk.ticker,
    );
    if (newsCatalyst) {
      return newsCatalyst;
    }

    return {
      type: CatalystType.NEWS,
      headline: 'No material news or event catalyst identified for today.',
      ticker: topOpportunity.ticker,
      occurredAt: new Date().toISOString(),
      source: 'system',
    };
  }

  private pickEventCatalyst(
    events: MarketEvent[],
    opportunityTicker: string,
    riskTicker: string,
  ): MarketTodayCatalyst | null {
    if (events.length === 0) {
      return null;
    }

    const preferred =
      events.find((event) => event.ticker === opportunityTicker) ??
      events.find((event) => event.ticker === riskTicker) ??
      events[0];

    return {
      type: CatalystType.EVENT,
      headline: preferred.title,
      ticker: preferred.ticker,
      occurredAt: preferred.eventDate,
      source: preferred.provider,
    };
  }

  private pickNewsCatalyst(
    news: NewsItem[],
    opportunityTicker: string,
    riskTicker: string,
  ): MarketTodayCatalyst | null {
    if (news.length === 0) {
      return null;
    }

    const preferred =
      news.find((item) =>
        item.relatedTickers.includes(opportunityTicker),
      ) ??
      news.find((item) => item.relatedTickers.includes(riskTicker)) ??
      news[0];

    return {
      type: CatalystType.NEWS,
      headline: preferred.title,
      ticker:
        preferred.relatedTickers.find((ticker) =>
          [opportunityTicker, riskTicker, 'SPY', 'QQQ'].includes(ticker),
        ) ??
        preferred.relatedTickers[0] ??
        null,
      occurredAt: preferred.publishedAt,
      source: preferred.provider,
    };
  }

  private buildSummary(
    profile: AnalysisProfile,
    marketDirection: MarketDirection,
    topOpportunity: MarketTodayPick,
    topRisk: MarketTodayPick,
    catalyst: MarketTodayCatalyst,
  ): string {
    return (
      `${profile} setup is ${marketDirection}: ` +
      `${topOpportunity.ticker} leads opportunities while ` +
      `${topRisk.ticker} is the weakest score. ` +
      `Catalyst: ${catalyst.headline}`
    );
  }
}
