import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private readonly configService: NestConfigService) {}

  getFinnhubApiKey(): string {
    return this.configService.getOrThrow<string>('FINNHUB_API_KEY');
  }

  /**
   * Returns a configured Finnhub key, or undefined when unset/blank.
   * Callers may fall back to another market-data source for local/dev use.
   */
  getOptionalFinnhubApiKey(): string | undefined {
    const key = this.configService.get<string>('FINNHUB_API_KEY');
    if (key == null || key.trim() === '') {
      return undefined;
    }
    return key;
  }

  /** Directory for the persisted portfolio store JSON file. */
  getPortfolioDataDir(): string {
    const dir = this.configService.get<string>('PORTFOLIO_DATA_DIR');
    return dir && dir.trim() !== '' ? dir : './data';
  }

  /**
   * Background dashboard refresh cadence in milliseconds.
   * Floors sub-30s and invalid values to the 5-minute default to avoid
   * hammering upstream market-data providers.
   */
  getAnalysisRefreshIntervalMs(): number {
    const DEFAULT_MS = 300_000;
    const MIN_MS = 30_000;
    const raw = this.configService.get<string>('ANALYSIS_REFRESH_INTERVAL_MS');
    const parsed = raw != null ? Number(raw) : NaN;
    if (!Number.isFinite(parsed) || parsed < MIN_MS) {
      return DEFAULT_MS;
    }
    return parsed;
  }
}
