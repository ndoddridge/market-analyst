import { Injectable } from '@nestjs/common';
import { HistoryProvider } from './history.provider';
import {
  HistoryRange,
  type HistoricalCandle,
  type HistoricalPriceResponse,
} from './types/historical-candle';

@Injectable()
export class HistoryService {
  constructor(private readonly historyProvider: HistoryProvider) {}

  async getHistory(
    symbol: string,
    range: HistoryRange,
  ): Promise<HistoricalPriceResponse> {
    const candles: HistoricalCandle[] =
      await this.historyProvider.getHistoricalCandles(symbol, range);

    return {
      symbol,
      range,
      candles,
    };
  }
}
