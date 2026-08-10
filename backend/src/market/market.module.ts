import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { EventsModule } from '../events/events.module';
import { NewsModule } from '../news/news.module';
import { PredictionModule } from '../prediction/prediction.module';
import { ScannerModule } from '../scanner/scanner.module';
import { MarketController } from './market.controller';
import { MarketDataProvider } from './market-data.provider';
import { MarketTodayService } from './market-today.service';
import { MarketService } from './market.service';

@Module({
  imports: [
    forwardRef(() => ScannerModule),
    NewsModule,
    EventsModule,
    forwardRef(() => PredictionModule),
  ],
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
