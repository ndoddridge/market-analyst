import { Injectable, Logger } from '@nestjs/common';
import { AnalysisService } from '../analysis/analysis.service';
import {
  AnalysisProfile,
  DEFAULT_ANALYSIS_PROFILE,
} from '../analysis/types/analysis-profile';
import type { ScannerResult } from './types/scanner-result';

const DEFAULT_WATCHLIST = [
  'AAPL',
  'MSFT',
  'NVDA',
  'AMD',
  'META',
  'TSM',
  'SPY',
  'QQQ',
] as const;

export type ScannerScanOptions = {
  watchlist?: readonly string[];
  profile?: AnalysisProfile;
};

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(private readonly analysisService: AnalysisService) {}

  async scan(options: ScannerScanOptions = {}): Promise<ScannerResult[]> {
    const watchlist = options.watchlist ?? DEFAULT_WATCHLIST;
    const profile = options.profile ?? DEFAULT_ANALYSIS_PROFILE;

    const settled = await Promise.allSettled(
      watchlist.map((ticker) =>
        this.analysisService.analyzeSummary(ticker, profile),
      ),
    );

    const results: ScannerResult[] = [];

    for (let index = 0; index < settled.length; index += 1) {
      const outcome = settled[index];
      const ticker = watchlist[index];

      if (outcome.status === 'rejected') {
        const reason =
          outcome.reason instanceof Error
            ? outcome.reason.message
            : String(outcome.reason);
        this.logger.warn(`Skipping ${ticker}: ${reason}`);
        continue;
      }

      const summary = outcome.value;
      results.push({
        ticker: summary.ticker,
        companyName: summary.companyName,
        profile: summary.profile,
        recommendation: summary.recommendation,
        score: summary.score,
        confidence: summary.confidence,
        suggestedHoldingWindow: summary.suggestedHoldingWindow,
        recommendedAction: summary.strategy.recommendedAction,
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }
}
