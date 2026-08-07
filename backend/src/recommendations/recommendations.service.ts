import { Injectable } from '@nestjs/common';

@Injectable()
export class RecommendationsService {
  getStatus(): string {
    return 'Recommendations module is online';
  }
}
