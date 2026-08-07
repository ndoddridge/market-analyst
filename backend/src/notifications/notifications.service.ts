import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  getStatus(): string {
    return 'Notifications module is online';
  }
}
