import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from './config/config.service';
import { MarketModule } from './market/market.module';
import { CompanyModule } from './company/company.module';
import { AnalysisModule } from './analysis/analysis.module';
import { HistoryModule } from './history/history.module';
import { ScannerModule } from './scanner/scanner.module';
import { NewsModule } from './news/news.module';
import { EventsModule } from './events/events.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SharedModule } from './shared/shared.module';
import { TodayModule } from './today/today.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MarketModule,
    CompanyModule,
    AnalysisModule,
    HistoryModule,
    ScannerModule,
    NewsModule,
    EventsModule,
    RecommendationsModule,
    NotificationsModule,
    SharedModule,
    TodayModule,
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class AppModule {}
