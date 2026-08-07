import { BadRequestException, Injectable } from '@nestjs/common';
import { HistoryService } from '../history/history.service';
import { HistoryRange } from '../history/types/historical-candle';
import type { HistoricalCandle } from '../history/types/historical-candle';
import {
  MarketTrend,
  TrendMomentum,
  TrendStrength,
  type TrendAnalysis,
} from './types/trend-analysis';

@Injectable()
export class TrendAnalysisService {
  constructor(private readonly historyService: HistoryService) {}

  async analyzeTrend(symbol: string): Promise<TrendAnalysis> {
    const { candles } = await this.historyService.getHistory(
      symbol,
      HistoryRange.SixMonths,
    );

    return this.analyzeCandles(candles);
  }

  analyzeCandles(candles: HistoricalCandle[]): TrendAnalysis {
    if (candles.length < 50) {
      throw new BadRequestException(
        'Insufficient historical data for trend analysis (need at least 50 daily candles).',
      );
    }

    const closes = candles.map((candle) => candle.close);
    const sma20 = this.average(closes.slice(-20));
    const sma50 = this.average(closes.slice(-50));
    const priceChange30Days = this.calculatePriceChangePercent(closes, 30);
    const volatility = this.calculateVolatility(closes);
    const trend = this.resolveTrend(sma20, sma50, priceChange30Days);
    const momentum = this.resolveMomentum(priceChange30Days);
    const strength = this.resolveStrength(priceChange30Days);
    const summary = this.buildSummary(
      trend,
      strength,
      momentum,
      priceChange30Days,
      volatility,
    );

    return {
      trend,
      strength,
      momentum,
      priceChange30Days: this.round(priceChange30Days, 2),
      volatility: this.round(volatility, 4),
      summary,
    };
  }

  private average(values: number[]): number {
    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
  }

  private calculatePriceChangePercent(
    closes: number[],
    tradingDays: number,
  ): number {
    const window = Math.min(tradingDays, closes.length - 1);
    const start = closes[closes.length - 1 - window];
    const end = closes[closes.length - 1];

    if (start === 0) {
      return 0;
    }

    return ((end - start) / start) * 100;
  }

  private calculateVolatility(closes: number[]): number {
    if (closes.length < 2) {
      return 0;
    }

    const dailyReturns: number[] = [];
    for (let i = 1; i < closes.length; i += 1) {
      const previous = closes[i - 1];
      if (previous === 0) {
        continue;
      }
      dailyReturns.push((closes[i] - previous) / previous);
    }

    if (dailyReturns.length === 0) {
      return 0;
    }

    const mean = this.average(dailyReturns);
    const variance =
      dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      dailyReturns.length;

    return Math.sqrt(variance);
  }

  private resolveTrend(
    sma20: number,
    sma50: number,
    priceChange30Days: number,
  ): MarketTrend {
    if (Math.abs(priceChange30Days) < 2) {
      return MarketTrend.SIDEWAYS;
    }

    if (sma20 > sma50) {
      return MarketTrend.BULLISH;
    }

    if (sma20 < sma50) {
      return MarketTrend.BEARISH;
    }

    return MarketTrend.SIDEWAYS;
  }

  private resolveMomentum(priceChange30Days: number): TrendMomentum {
    if (priceChange30Days > 1) {
      return TrendMomentum.INCREASING;
    }

    if (priceChange30Days < -1) {
      return TrendMomentum.DECREASING;
    }

    return TrendMomentum.STABLE;
  }

  private resolveStrength(priceChange30Days: number): TrendStrength {
    const absoluteChange = Math.abs(priceChange30Days);

    if (absoluteChange > 8) {
      return TrendStrength.HIGH;
    }

    if (absoluteChange >= 2) {
      return TrendStrength.MEDIUM;
    }

    return TrendStrength.LOW;
  }

  private buildSummary(
    trend: MarketTrend,
    strength: TrendStrength,
    momentum: TrendMomentum,
    priceChange30Days: number,
    volatility: number,
  ): string {
    const changeText = `${priceChange30Days >= 0 ? '+' : ''}${this.round(priceChange30Days, 2)}%`;
    const parts = [
      `The 20-day and 50-day average closing prices indicate a ${trend.toLowerCase()} trend with ${strength.toLowerCase()} strength.`,
      `30-day price change is ${changeText}, and momentum is ${momentum.toLowerCase()}.`,
    ];

    // Rough threshold: daily-return stdev above ~1.5% is relatively large for equities.
    if (volatility > 0.015) {
      parts.push(
        `Volatility is elevated (daily-return stdev ${this.round(volatility * 100, 2)}%), which may amplify short-term moves.`,
      );
    }

    return parts.join(' ');
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}
