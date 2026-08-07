import { Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { HistoryProvider } from './history.provider';

@Module({
  controllers: [HistoryController],
  providers: [HistoryService, HistoryProvider, ConfigService],
  exports: [HistoryService],
})
export class HistoryModule {}
