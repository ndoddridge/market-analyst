import { Injectable } from '@nestjs/common';

@Injectable()
export class EventsService {
  getStatus(): string {
    return 'Events module is online';
  }
}
