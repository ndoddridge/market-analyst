import { Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, ConfigService],
  exports: [EventsService],
})
export class EventsModule {}
