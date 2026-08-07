import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private readonly configService: NestConfigService) {}

  getFinnhubApiKey(): string {
    return this.configService.getOrThrow<string>('FINNHUB_API_KEY');
  }
}
