import { Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';

@Module({
  controllers: [NewsController],
  providers: [NewsService, ConfigService],
  exports: [NewsService],
})
export class NewsModule {}
