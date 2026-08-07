import { Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MarketDataProvider } from './market-data.provider';

@Module({
  controllers: [MarketController],
  providers: [MarketService, MarketDataProvider, ConfigService],
  exports: [MarketService],
})
export class MarketModule {}
