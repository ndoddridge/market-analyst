import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { NewsModule } from '../news/news.module';
import { ScannerModule } from '../scanner/scanner.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [ScannerModule, NewsModule, EventsModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
