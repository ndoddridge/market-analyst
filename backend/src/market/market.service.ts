import { Injectable } from '@nestjs/common';
import { MarketDataProvider } from './market-data.provider';
import type { MarketQuote } from './types/market-quote';

@Injectable()
export class MarketService {
  constructor(private readonly marketDataProvider: MarketDataProvider) {}

  getStatus(): string {
    return 'Market module is online';
  }

  getQuote(symbol: string): Promise<MarketQuote> {
    return this.marketDataProvider.getQuote(symbol);
  }
}
