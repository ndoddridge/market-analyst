import {
  Body,
  Controller,
  Get,
  Patch,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseAnalysisProfilePipe } from '../analysis/parse-analysis-profile.pipe';
import { AnalysisProfile } from '../analysis/types/analysis-profile';
import { PortfolioRepository } from '../portfolio/portfolio.repository';
import { DashboardService } from './dashboard.service';
import { DashboardSnapshot } from './types/dashboard';

const profilePipe = new ParseAnalysisProfilePipe();

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly portfolioRepository: PortfolioRepository,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Live decision-dashboard snapshot',
    description:
      'Returns the cached snapshot for the currently-selected horizon — never triggers a new scan, so polling is cheap.',
  })
  @ApiOkResponse({ type: DashboardSnapshot })
  @ApiServiceUnavailableResponse({
    description: 'The dashboard has not completed its first analysis yet.',
  })
  async getDashboard(): Promise<DashboardSnapshot> {
    const settings = await this.portfolioRepository.getSettings();
    const snapshot = this.dashboardService.getSnapshot(settings.horizonProfile);
    if (!snapshot) {
      throw new ServiceUnavailableException(
        'Dashboard has not completed its first analysis yet. Try again shortly.',
      );
    }
    return snapshot;
  }

  @Patch('profile')
  @ApiOperation({
    summary: 'Select and persist the dashboard horizon',
    description:
      'Persists SHORT_TERM or LONG_TERM as the active horizon and returns the resulting snapshot.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        profile: { type: 'string', enum: Object.values(AnalysisProfile) },
      },
      required: ['profile'],
    },
  })
  @ApiOkResponse({ type: DashboardSnapshot })
  async setProfile(
    @Body() body: { profile?: string },
  ): Promise<DashboardSnapshot> {
    const profile = profilePipe.transform(body?.profile ?? '');
    await this.portfolioRepository.updateSettings({ horizonProfile: profile });

    let snapshot = this.dashboardService.getSnapshot(profile);
    if (!snapshot) {
      await this.dashboardService.refresh(profile);
      snapshot = this.dashboardService.getSnapshot(profile);
    }

    if (!snapshot) {
      throw new ServiceUnavailableException(
        `Could not refresh the dashboard for ${profile} yet. Try again shortly.`,
      );
    }
    return snapshot;
  }
}
