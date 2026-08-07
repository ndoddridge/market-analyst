import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AnalysisService } from './analysis.service';
import type { AnalysisResult } from './types/analysis-result';
import { AnalysisSummary } from './types/analysis-summary';

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get(':symbol/details')
  @ApiOperation({
    description:
      'Retrieve the full analysis payload for debugging and advanced inspection.',
  })
  @ApiParam({
    name: 'symbol',
    description: 'Ticker symbol',
    example: 'AAPL',
  })
  @ApiOkResponse({
    description:
      'Detailed analysis including marketData, company, signals, and trendAnalysis.',
  })
  getAnalysisDetails(
    @Param('symbol') symbol: string,
  ): Promise<AnalysisResult> {
    return this.analysisService.analyze(symbol);
  }

  @Get(':symbol')
  @ApiOperation({
    description:
      'Retrieve a simplified analysis summary suitable for user-facing clients.',
  })
  @ApiParam({
    name: 'symbol',
    description: 'Ticker symbol',
    example: 'AAPL',
  })
  @ApiOkResponse({ type: AnalysisSummary })
  getAnalysisSummary(
    @Param('symbol') symbol: string,
  ): Promise<AnalysisSummary> {
    return this.analysisService.analyzeSummary(symbol);
  }
}
