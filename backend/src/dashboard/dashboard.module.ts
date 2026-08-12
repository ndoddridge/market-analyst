import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { EventsModule } from '../events/events.module';
import { MarketModule } from '../market/market.module';
import { NewsModule } from '../news/news.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { ScannerModule } from '../scanner/scanner.module';
import { DashboardController } from './dashboard.controller';
import { DashboardRefreshScheduler } from './dashboard-refresh.scheduler';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    forwardRef(() => PortfolioModule),
    ScannerModule,
    NewsModule,
    EventsModule,
    MarketModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRefreshScheduler, ConfigService],
  exports: [DashboardService],
})
export class DashboardModule {}
