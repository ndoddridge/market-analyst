import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import YahooFinance from 'yahoo-finance2';
import { ConfigService } from '../config/config.service';
import type { CompanyProfile } from './types/company-profile';

type FinnhubCompanyProfile2Response = {
  country?: string;
  currency?: string;
  exchange?: string;
  finnhubIndustry?: string;
  ipo?: string;
  logo?: string;
  marketCapitalization?: number;
  name?: string;
  ticker?: string;
  weburl?: string;
};

@Injectable()
export class CompanyProvider {
  private readonly profileUrl =
    'https://finnhub.io/api/v1/stock/profile2';
  private readonly yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey'],
  });

  constructor(private readonly configService: ConfigService) {}

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    const token = this.configService.getOptionalFinnhubApiKey();
    if (!token) {
      return this.getCompanyProfileFromYahoo(symbol);
    }

    try {
      const { data } = await axios.get<FinnhubCompanyProfile2Response>(
        this.profileUrl,
        {
          params: { symbol, token },
        },
      );

      if (!data || !data.ticker || !data.name) {
        throw new NotFoundException(
          `Company profile not found for symbol: ${symbol}`,
        );
      }

      return {
        symbol: data.ticker,
        name: data.name,
        exchange: this.normalizeExchange(data.exchange),
        currency: data.currency ?? '',
        country: data.country ?? '',
        marketCapitalization: this.normalizeMarketCapitalization(
          data.marketCapitalization,
        ),
        industry: data.finnhubIndustry ?? '',
        ipoDate: data.ipo ?? '',
        logoUrl: this.normalizeOptionalUrl(data.logo),
        website: this.normalizeOptionalUrl(data.weburl),
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
        `Failed to fetch company profile for symbol: ${symbol}`,
      );
    }
  }

  private async getCompanyProfileFromYahoo(
    symbol: string,
  ): Promise<CompanyProfile> {
    try {
      const summary = await this.yahooFinance.quoteSummary(symbol, {
        modules: ['price', 'summaryProfile', 'assetProfile'],
      });

      const price = summary.price;
      const profile = summary.summaryProfile ?? summary.assetProfile;
      const name = price?.longName ?? price?.shortName;

      if (!name) {
        throw new NotFoundException(
          `Company profile not found for symbol: ${symbol}`,
        );
      }

      return {
        symbol: price?.symbol ?? symbol,
        name,
        exchange: this.normalizeExchange(price?.exchangeName),
        currency: price?.currency ?? '',
        country: this.normalizeCountry(profile?.country),
        marketCapitalization: price?.marketCap ?? 0,
        industry: profile?.industry ?? profile?.sector ?? '',
        ipoDate: '',
        logoUrl: null,
        website: this.normalizeOptionalUrl(profile?.website),
        source: 'Yahoo Finance',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new BadGatewayException(
        `Failed to fetch company profile for symbol: ${symbol}`,
      );
    }
  }

  private normalizeExchange(exchange?: string): string {
    if (!exchange) {
      return '';
    }

    return exchange.trim().split(/\s+/)[0] ?? '';
  }

  private normalizeCountry(country?: string): string {
    if (!country) {
      return '';
    }

    const normalized = country.trim();
    if (
      normalized === 'United States' ||
      normalized === 'USA' ||
      normalized === 'United States of America'
    ) {
      return 'US';
    }

    return normalized;
  }

  private normalizeMarketCapitalization(value?: number): number {
    if (value == null) {
      return 0;
    }

    return value * 1_000_000_000;
  }

  private normalizeOptionalUrl(value?: string): string | null {
    if (!value) {
      return null;
    }

    return value;
  }

  private throwForAxiosError(error: AxiosError, symbol: string): never {
    const status = error.response?.status;

    if (status === 401 || status === 403) {
      throw new ServiceUnavailableException(
        'Company data provider authentication failed',
      );
    }

    if (status === 404 || status === 422) {
      throw new NotFoundException(
        `Company profile not found for symbol: ${symbol}`,
      );
    }

    throw new BadGatewayException(
      `Failed to fetch company profile for symbol: ${symbol}`,
    );
  }
}
