import { Injectable, Logger } from '@nestjs/common';
import { AnalysisService } from '../analysis/analysis.service';
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

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(private readonly analysisService: AnalysisService) {}

  async scan(watchlist: readonly string[] = DEFAULT_WATCHLIST): Promise<ScannerResult[]> {
    const settled = await Promise.allSettled(
      watchlist.map((ticker) => this.analysisService.analyzeSummary(ticker)),
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
