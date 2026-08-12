import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { DashboardService } from '../dashboard/dashboard.service';
import { createManualPosition, parsePortfolioCsv } from './portfolio-csv';
import { PortfolioRepository } from './portfolio.repository';
import type { CsvParseResult, PortfolioPositionInput } from './types/portfolio';
import type { PersistedPortfolio } from './types/portfolio-store';

export type ImportCsvResult = {
  positions: PortfolioPositionInput[];
  errors: CsvParseResult['errors'];
  uploadedAt: string | null;
};

/**
 * CSV parsing + server-side persistence only. Analysis/decision composition
 * lives in DashboardService — this service never scans or scores.
 */
@Injectable()
export class PortfolioService {
  constructor(
    private readonly portfolioRepository: PortfolioRepository,
    @Optional()
    @Inject(forwardRef(() => DashboardService))
    private readonly dashboardService?: DashboardService,
  ) {}

  parseCsv(csvText: string): CsvParseResult {
    return parsePortfolioCsv(csvText);
  }

  getPortfolio(): Promise<PersistedPortfolio> {
    return this.portfolioRepository.getPortfolio();
  }

  async importCsv(
    csvText: string,
    sourceFilename?: string | null,
  ): Promise<ImportCsvResult> {
    const parsed = parsePortfolioCsv(csvText);
    if (parsed.positions.length === 0) {
      throw new BadRequestException({
        message: 'No valid positions found in CSV.',
        errors: parsed.errors,
      });
    }

    const portfolio = await this.portfolioRepository.replacePortfolio(
      parsed.positions,
      { sourceFilename },
    );
    await this.refreshDashboard();

    return {
      positions: portfolio.positions,
      errors: parsed.errors,
      uploadedAt: portfolio.uploadedAt,
    };
  }

  async upsertPosition(input: {
    ticker: string;
    shares: number | string;
    avgCost: number | string;
    currentPrice: number | string;
  }): Promise<PersistedPortfolio> {
    const parsed = createManualPosition(input);
    if (parsed.error || !parsed.position) {
      throw new BadRequestException(parsed.error ?? 'Invalid position.');
    }

    const portfolio = await this.portfolioRepository.upsertPosition(
      parsed.position,
    );
    await this.refreshDashboard();
    return portfolio;
  }

  async removePosition(ticker: string): Promise<PersistedPortfolio> {
    const portfolio = await this.portfolioRepository.removePosition(ticker);
    await this.refreshDashboard();
    return portfolio;
  }

  async clearPortfolio(): Promise<PersistedPortfolio> {
    const portfolio = await this.portfolioRepository.clearPortfolio();
    await this.refreshDashboard();
    return portfolio;
  }

  /** Best-effort — a failed refresh just leaves the last-good dashboard snapshot in place. */
  private async refreshDashboard(): Promise<void> {
    if (!this.dashboardService) {
      return;
    }
    try {
      const settings = await this.portfolioRepository.getSettings();
      await this.dashboardService.refresh(settings.horizonProfile);
    } catch {
      // GET /dashboard will still serve the previous snapshot.
    }
  }
}
