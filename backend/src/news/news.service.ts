import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import YahooFinance from 'yahoo-finance2';
import { ConfigService } from '../config/config.service';
import type { NewsItem } from './types/news-item';

type FinnhubCompanyNewsItem = {
  id?: number;
  headline?: string;
  source?: string;
  url?: string;
  datetime?: number;
  related?: string;
};

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private readonly yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey'],
  });
  private readonly companyNewsUrl = 'https://finnhub.io/api/v1/company-news';

  constructor(private readonly configService: ConfigService) {}

  getStatus(): string {
    return 'News module is online';
  }

  /**
   * Recent headlines for the given symbols (Finnhub when configured, else Yahoo).
   */
  async getRecentNews(symbols: readonly string[]): Promise<NewsItem[]> {
    const unique = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
    if (unique.length === 0) {
      return [];
    }

    const token = this.configService.getOptionalFinnhubApiKey();
    if (token) {
      try {
        return await this.getRecentNewsFromFinnhub(unique, token);
      } catch (error) {
        this.logger.warn(
          `Finnhub news failed; falling back to Yahoo: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return this.getRecentNewsFromYahoo(unique);
  }

  private async getRecentNewsFromFinnhub(
    symbols: string[],
    token: string,
  ): Promise<NewsItem[]> {
    const to = new Date();
    const from = new Date(to.getTime() - 3 * 24 * 60 * 60 * 1000);
    const fromStr = this.toDateString(from);
    const toStr = this.toDateString(to);

    const batches = await Promise.all(
      symbols.map(async (symbol) => {
        const { data } = await axios.get<FinnhubCompanyNewsItem[]>(
          this.companyNewsUrl,
          {
            params: { symbol, from: fromStr, to: toStr, token },
          },
        );

        return (data ?? []).slice(0, 5).map((item, index) => ({
          id: String(item.id ?? `${symbol}-${item.datetime ?? index}`),
          title: item.headline?.trim() || `News for ${symbol}`,
          source: item.source?.trim() || 'Finnhub',
          url: item.url ?? null,
          publishedAt:
            item.datetime != null
              ? new Date(item.datetime * 1000).toISOString()
              : new Date().toISOString(),
          relatedTickers: [symbol],
          provider: 'Finnhub',
        }));
      }),
    );

    return batches
      .flat()
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
  }

  private async getRecentNewsFromYahoo(
    symbols: string[],
  ): Promise<NewsItem[]> {
    const batches = await Promise.all(
      symbols.map(async (symbol) => {
        const result = await this.yahooFinance.search(symbol);
        return (result.news ?? []).slice(0, 5).map((item, index) => ({
          id: item.uuid || `${symbol}-news-${index}`,
          title: item.title?.trim() || `News for ${symbol}`,
          source: item.publisher?.trim() || 'Yahoo Finance',
          url: item.link ?? null,
          publishedAt:
            item.providerPublishTime != null
              ? new Date(item.providerPublishTime).toISOString()
              : new Date().toISOString(),
          relatedTickers:
            item.relatedTickers?.map((ticker) => ticker.toUpperCase()) ?? [
              symbol,
            ],
          provider: 'Yahoo Finance',
        }));
      }),
    );

    return batches
      .flat()
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
