import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { DashboardModule } from '../dashboard/dashboard.module';
import { FilePortfolioRepository } from './file-portfolio.repository';
import { PortfolioController } from './portfolio.controller';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioService } from './portfolio.service';

@Module({
  imports: [forwardRef(() => DashboardModule)],
  controllers: [PortfolioController],
  providers: [
    PortfolioService,
    ConfigService,
    {
      provide: PortfolioRepository,
      useClass: FilePortfolioRepository,
    },
  ],
  exports: [PortfolioService, PortfolioRepository],
})
export class PortfolioModule {}
