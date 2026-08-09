import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import YahooFinance from 'yahoo-finance2';
import { ConfigService } from '../config/config.service';
import {
  MarketEventType,
  type MarketEvent,
} from './types/market-event';

type FinnhubEarningsCalendarResponse = {
  earningsCalendar?: Array<{
    symbol?: string;
    date?: string;
    hour?: string;
    epsEstimate?: number | null;
  }>;
};

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly yahooFinance = new YahooFinance({
    suppressNotices: ['yahooSurvey'],
  });
  private readonly earningsCalendarUrl =
    'https://finnhub.io/api/v1/calendar/earnings';

  constructor(private readonly configService: ConfigService) {}

  getStatus(): string {
    return 'Events module is online';
  }

  /**
   * Upcoming/near-term market events for symbols (earnings first).
   */
  async getUpcomingEvents(
    symbols: readonly string[],
  ): Promise<MarketEvent[]> {
    const unique = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
    if (unique.length === 0) {
      return [];
    }

    const token = this.configService.getOptionalFinnhubApiKey();
    if (token) {
      try {
        return await this.getUpcomingEventsFromFinnhub(unique, token);
      } catch (error) {
        this.logger.warn(
          `Finnhub events failed; falling back to Yahoo: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return this.getUpcomingEventsFromYahoo(unique);
  }

  private async getUpcomingEventsFromFinnhub(
    symbols: string[],
    token: string,
  ): Promise<MarketEvent[]> {
    const from = new Date();
    const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
    const symbolSet = new Set(symbols);

    const { data } = await axios.get<FinnhubEarningsCalendarResponse>(
      this.earningsCalendarUrl,
      {
        params: {
          from: this.toDateString(from),
          to: this.toDateString(to),
          token,
        },
      },
    );

    return (data.earningsCalendar ?? [])
      .filter((item) => item.symbol && symbolSet.has(item.symbol.toUpperCase()))
      .map((item) => {
        const ticker = (item.symbol as string).toUpperCase();
        const eventDate = item.date
          ? new Date(`${item.date}T00:00:00.000Z`).toISOString()
          : new Date().toISOString();

        return {
          id: `earnings-${ticker}-${item.date ?? 'unknown'}`,
          title: `${ticker} earnings${item.hour ? ` (${item.hour})` : ''}`,
          type: MarketEventType.EARNINGS,
          ticker,
          eventDate,
          provider: 'Finnhub',
        };
      })
      .sort(
        (a, b) =>
          new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
      );
  }

  private async getUpcomingEventsFromYahoo(
    symbols: string[],
  ): Promise<MarketEvent[]> {
    const now = Date.now();
    const horizonMs = 45 * 24 * 60 * 60 * 1000;

    const batches = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const summary = await this.yahooFinance.quoteSummary(symbol, {
            modules: ['calendarEvents'],
          });
          const calendar = summary.calendarEvents;
          const events: MarketEvent[] = [];

          const earningsDates = calendar?.earnings?.earningsDate ?? [];
          for (const raw of earningsDates) {
            const eventDate = new Date(raw).toISOString();
            const ts = new Date(eventDate).getTime();
            if (Number.isNaN(ts) || ts < now - 2 * 24 * 60 * 60 * 1000) {
              continue;
            }
            if (ts > now + horizonMs) {
              continue;
            }
            events.push({
              id: `earnings-${symbol}-${eventDate}`,
              title: `${symbol} earnings`,
              type: MarketEventType.EARNINGS,
              ticker: symbol,
              eventDate,
              provider: 'Yahoo Finance',
            });
          }

          if (calendar?.exDividendDate) {
            const eventDate = new Date(calendar.exDividendDate).toISOString();
            const ts = new Date(eventDate).getTime();
            if (!Number.isNaN(ts) && ts >= now && ts <= now + horizonMs) {
              events.push({
                id: `dividend-${symbol}-${eventDate}`,
                title: `${symbol} ex-dividend`,
                type: MarketEventType.DIVIDEND,
                ticker: symbol,
                eventDate,
                provider: 'Yahoo Finance',
              });
            }
          }

          return events;
        } catch (error) {
          this.logger.warn(
            `Yahoo events failed for ${symbol}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return [];
        }
      }),
    );

    return batches
      .flat()
      .sort(
        (a, b) =>
          new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime(),
      );
  }

  private toDateString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
