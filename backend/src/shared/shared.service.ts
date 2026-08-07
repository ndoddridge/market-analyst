import { Injectable } from '@nestjs/common';

@Injectable()
export class SharedService {
  getStatus(): string {
    return 'Shared module is online';
  }
}
