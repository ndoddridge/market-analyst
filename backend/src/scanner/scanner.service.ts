import { Injectable } from '@nestjs/common';
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
  constructor(private readonly analysisService: AnalysisService) {}

  async scan(watchlist: readonly string[] = DEFAULT_WATCHLIST): Promise<ScannerResult[]> {
    const settled = await Promise.allSettled(
      watchlist.map((ticker) => this.analysisService.analyzeSummary(ticker)),
    );

    const results: ScannerResult[] = [];
    const failures: unknown[] = [];

    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        failures.push(outcome.reason);
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

    // Partial watchlist failures are skipped; total failure should not look like
    // an empty successful scan.
    if (results.length === 0 && failures.length > 0) {
      const reason = failures[0];
      if (reason instanceof Error) {
        throw reason;
      }
      throw new Error(String(reason));
    }

    return results.sort((a, b) => b.score - a.score);
  }
}
