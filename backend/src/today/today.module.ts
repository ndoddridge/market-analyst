import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { TodayController } from './today.controller';

@Module({
  imports: [MarketModule],
  controllers: [TodayController],
})
export class TodayModule {}
