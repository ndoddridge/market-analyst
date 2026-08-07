import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { HistoryModule } from '../history/history.module';
import { MarketModule } from '../market/market.module';
import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';
import { SignalEngineService } from './signal-engine.service';
import { StrategyEngineService } from './strategy-engine.service';
import { TrendAnalysisService } from './trend-analysis.service';

@Module({
  imports: [MarketModule, CompanyModule, HistoryModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    TrendAnalysisService,
    SignalEngineService,
    StrategyEngineService,
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
