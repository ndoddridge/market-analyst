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
}
