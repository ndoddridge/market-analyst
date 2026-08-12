import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import YahooFinance from 'yahoo-finance2';
import { ConfigService } from '../config/config.service';
import type { ExtendedQuote } from './types/extended-quote';
import type { MarketQuote } from './types/market-quote';

type FinnhubQuoteResponse = {
  c: number;
  t: number;
};

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

@Injectable()
export class MarketDataProvider {
  private readonly quoteUrl = 'https://finnhub.io/api/v1/quote';
  private readonly yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey'],
  });

  constructor(private readonly configService: ConfigService) {}

  async getQuote(symbol: string): Promise<MarketQuote> {
    const token = this.configService.getOptionalFinnhubApiKey();
    if (!token) {
      return this.getQuoteFromYahoo(symbol);
    }

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

  private async getQuoteFromYahoo(symbol: string): Promise<MarketQuote> {
    try {
      const quote = await this.yahooFinance.quote(symbol);
      const price = quote.regularMarketPrice;

      if (price == null || price === 0) {
        throw new NotFoundException(`Quote not found for symbol: ${symbol}`);
      }

      const timestamp =
        quote.regularMarketTime != null
          ? new Date(quote.regularMarketTime).toISOString()
          : new Date().toISOString();

      return {
        symbol,
        price,
        currency: quote.currency ?? 'USD',
        timestamp,
        source: 'Yahoo Finance',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new BadGatewayException(
        `Failed to fetch quote for symbol: ${symbol}`,
      );
    }
  }

  /**
   * Extended-hours quote for next-open estimation. Always sourced from Yahoo
   * Finance (pre/post-market fields), independent of the primary quote
   * provider, and requires no API key.
   */
  async getExtendedQuote(symbol: string): Promise<ExtendedQuote> {
    try {
      const quote = await this.yahooFinance.quote(symbol);
      return {
        symbol,
        regularMarketPreviousClose: toNumberOrNull(
          quote.regularMarketPreviousClose,
        ),
        preMarketPrice: toNumberOrNull(quote.preMarketPrice),
        postMarketPrice: toNumberOrNull(quote.postMarketPrice),
        regularMarketDayHigh: toNumberOrNull(quote.regularMarketDayHigh),
        regularMarketDayLow: toNumberOrNull(quote.regularMarketDayLow),
        marketState: toStringOrNull(quote.marketState),
      };
    } catch {
      throw new BadGatewayException(
        `Failed to fetch extended quote for symbol: ${symbol}`,
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
