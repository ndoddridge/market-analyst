import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { ConfigService } from '../config/config.service';
import type { MarketQuote } from './types/market-quote';

type FinnhubQuoteResponse = {
  c: number;
  t: number;
};

@Injectable()
export class MarketDataProvider {
  private readonly quoteUrl = 'https://finnhub.io/api/v1/quote';

  constructor(private readonly configService: ConfigService) {}

  async getQuote(symbol: string): Promise<MarketQuote> {
    const token = this.configService.getFinnhubApiKey();

    try {
      const { data } = await axios.get<FinnhubQuoteResponse>(this.quoteUrl, {
        params: { symbol, token },
      });

      if (!data || data.c == null || data.c === 0) {
        throw new NotFoundException(`Quote not found for symbol: ${symbol}`);
      }

      const timestamp =
        data.t && data.t > 0
          ? new Date(data.t * 1000).toISOString()
          : new Date().toISOString();

      return {
        symbol,
        price: data.c,
        currency: 'USD',
        timestamp,
        source: 'Finnhub',
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        this.throwForAxiosError(error, symbol);
      }

      throw new BadGatewayException(
        `Failed to fetch quote for symbol: ${symbol}`,
      );
    }
  }

  private throwForAxiosError(error: AxiosError, symbol: string): never {
    const status = error.response?.status;

    if (status === 401 || status === 403) {
      throw new ServiceUnavailableException(
        'Market data provider authentication failed',
      );
    }

    if (status === 404 || status === 422) {
      throw new NotFoundException(`Quote not found for symbol: ${symbol}`);
    }

    throw new BadGatewayException(
      `Failed to fetch quote for symbol: ${symbol}`,
    );
  }
}
