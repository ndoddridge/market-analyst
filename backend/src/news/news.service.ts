import { Injectable } from '@nestjs/common';

@Injectable()
export class NewsService {
  getStatus(): string {
    return 'News module is online';
  }
}
