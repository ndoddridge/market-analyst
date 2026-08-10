import { Controller, DefaultValuePipe, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  AnalysisProfile,
  DEFAULT_ANALYSIS_PROFILE,
} from '../analysis/types/analysis-profile';
import { ParseAnalysisProfilePipe } from '../analysis/parse-analysis-profile.pipe';
import { ScannerService } from './scanner.service';
import { ScannerResult } from './types/scanner-result';

@ApiTags('scanner')
@Controller('scanner')
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Get()
  @ApiOperation({
    summary: 'Scan watchlist',
    description:
      'Analyze the default watchlist (AAPL, MSFT, NVDA, AMD, META, TSM, SPY, QQQ) via the shared analysis pipeline for the selected profile and return results sorted by score (highest first).',
  })
  @ApiQuery({
    name: 'profile',
    required: false,
    enum: AnalysisProfile,
    description:
      'Analysis profile controlling scoring emphasis and holding-window horizon. Defaults to SHORT_TERM.',
    example: DEFAULT_ANALYSIS_PROFILE,
  })
  @ApiOkResponse({
    description: 'Ranked scanner results for the default watchlist.',
    type: [ScannerResult],
  })
  scan(
    @Query(
      'profile',
      new DefaultValuePipe(DEFAULT_ANALYSIS_PROFILE),
      ParseAnalysisProfilePipe,
    )
    profile: AnalysisProfile,
  ): Promise<ScannerResult[]> {
    return this.scannerService.scan({ profile });
  }
}
