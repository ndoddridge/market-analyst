import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { ScannerModule } from '../scanner/scanner.module';
import { MarketController } from './market.controller';
import { MarketDataProvider } from './market-data.provider';
import { MarketTodayService } from './market-today.service';
import { MarketService } from './market.service';

@Module({
  imports: [forwardRef(() => ScannerModule)],
  controllers: [MarketController],
  providers: [
    MarketService,
    MarketDataProvider,
    ConfigService,
    MarketTodayService,
  ],
  exports: [MarketService, MarketTodayService],
})
export class MarketModule {}
