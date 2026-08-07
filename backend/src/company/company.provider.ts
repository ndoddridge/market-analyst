import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { AxiosError } from 'axios';
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

  constructor(private readonly configService: ConfigService) {}

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    const token = this.configService.getFinnhubApiKey();

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

  private normalizeExchange(exchange?: string): string {
    if (!exchange) {
      return '';
    }

    return exchange.trim().split(/\s+/)[0] ?? '';
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
