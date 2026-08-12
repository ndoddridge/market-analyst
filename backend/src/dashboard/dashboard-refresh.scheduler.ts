import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { PortfolioRepository } from '../portfolio/portfolio.repository';
import { isMarketOpen } from '../shared/market-hours';
import { DashboardService } from './dashboard.service';

/**
 * Hand-rolled interval loop (not @nestjs/schedule) — a single background job
 * in a single process doesn't need a scheduler dependency. Refreshes the
 * currently-selected horizon profile during market hours; while closed it
 * only refreshes once per interval (to drive the estimated-open calc)
 * instead of on every tick, to avoid hammering upstream providers.
 */
@Injectable()
export class DashboardRefreshScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DashboardRefreshScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly portfolioRepository: PortfolioRepository,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((error) => {
        this.logger.warn(
          `Dashboard refresh tick failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, this.configService.getAnalysisRefreshIntervalMs());
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    const { horizonProfile } = await this.portfolioRepository.getSettings();

    if (isMarketOpen()) {
      await this.dashboardService.refresh(horizonProfile);
      return;
    }

    const snapshot = this.dashboardService.getSnapshot(horizonProfile);
    const lastRefresh = snapshot?.staleness.lastSuccessfulRefreshAt ?? null;
    const intervalMs = this.configService.getAnalysisRefreshIntervalMs();

    if (!lastRefresh || Date.now() - Date.parse(lastRefresh) >= intervalMs) {
      await this.dashboardService.refresh(horizonProfile);
    }
  }
}
