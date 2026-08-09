import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AnalysisProfile,
  DEFAULT_ANALYSIS_PROFILE,
} from '../analysis/types/analysis-profile';
import { Recommendation } from '../analysis/types/analysis-result';
import { ScannerService } from '../scanner/scanner.service';
import type { ScannerResult } from '../scanner/types/scanner-result';
import {
  MarketDirection,
  type MarketTodayPick,
  type MarketTodayResult,
} from './types/market-today';

@Injectable()
export class MarketTodayService {
  constructor(private readonly scannerService: ScannerService) {}

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
    const summary = this.buildSummary(
      profile,
      marketDirection,
      topOpportunity,
      topRisk,
    );

    return {
      profile,
      marketDirection,
      topOpportunity,
      topRisk,
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

  private buildSummary(
    profile: AnalysisProfile,
    marketDirection: MarketDirection,
    topOpportunity: MarketTodayPick,
    topRisk: MarketTodayPick,
  ): string {
    return (
      `${profile} setup is ${marketDirection}: ` +
      `${topOpportunity.ticker} leads opportunities while ` +
      `${topRisk.ticker} is the weakest score.`
    );
  }
}
