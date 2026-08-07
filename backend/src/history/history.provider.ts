import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';
import {
  HistoryRange,
  type HistoricalCandle,
} from './types/historical-candle';

@Injectable()
export class HistoryProvider {
  private readonly yahooFinance = new YahooFinance();

  async getHistoricalCandles(
    symbol: string,
    range: HistoryRange,
  ): Promise<HistoricalCandle[]> {
    const { period1, period2 } = this.resolveTimeRange(range);

    try {
      const result = await this.yahooFinance.chart(symbol, {
        period1,
        period2,
        interval: '1d',
      });

      const quotes = result.quotes ?? [];

      if (quotes.length === 0) {
        throw new NotFoundException(
          `Historical data not found for symbol: ${symbol}`,
        );
      }

      const candles: HistoricalCandle[] = quotes
        .filter(
          (quote) =>
            quote.date != null &&
            quote.open != null &&
            quote.high != null &&
            quote.low != null &&
            quote.close != null &&
            quote.volume != null,
        )
        .map((quote) => ({
          timestamp: new Date(quote.date).toISOString(),
          open: quote.open as number,
          high: quote.high as number,
          low: quote.low as number,
          close: quote.close as number,
          volume: quote.volume as number,
        }));

      if (candles.length === 0) {
        throw new NotFoundException(
          `Historical data not found for symbol: ${symbol}`,
        );
      }

      return candles;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      if (this.isNotFoundError(error)) {
        throw new NotFoundException(
          `Historical data not found for symbol: ${symbol}`,
        );
      }

      throw new BadGatewayException(
        `Failed to fetch historical data for symbol: ${symbol}`,
      );
    }
  }

  private resolveTimeRange(range: HistoryRange): {
    period1: Date;
    period2: Date;
  } {
    const period2 = new Date();
    const period1 = new Date();

    switch (range) {
      case HistoryRange.OneMonth:
        period1.setMonth(period1.getMonth() - 1);
        break;
      case HistoryRange.ThreeMonths:
        period1.setMonth(period1.getMonth() - 3);
        break;
      case HistoryRange.SixMonths:
        period1.setMonth(period1.getMonth() - 6);
        break;
      case HistoryRange.OneYear:
        period1.setFullYear(period1.getFullYear() - 1);
        break;
    }

    return { period1, period2 };
  }

  private isNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    return (
      message.includes('not found') ||
      message.includes('delisted') ||
      message.includes('no data')
    );
  }
}
