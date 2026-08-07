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

    for (const outcome of settled) {
      if (outcome.status !== 'fulfilled') {
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
