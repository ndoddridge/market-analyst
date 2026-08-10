import { Module, forwardRef } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { InMemoryPredictionRepository } from './in-memory-prediction.repository';
import { PredictionController } from './prediction.controller';
import { PredictionRepository } from './prediction.repository';
import { PredictionService } from './prediction.service';

@Module({
  imports: [forwardRef(() => MarketModule)],
  controllers: [PredictionController],
  providers: [
    PredictionService,
    {
      provide: PredictionRepository,
      useClass: InMemoryPredictionRepository,
    },
  ],
  exports: [PredictionService, PredictionRepository],
})
export class PredictionModule {}
