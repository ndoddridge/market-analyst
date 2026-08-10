import { Controller, DefaultValuePipe, Get, Query } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseAnalysisProfilePipe } from '../analysis/parse-analysis-profile.pipe';
import {
  AnalysisProfile,
  DEFAULT_ANALYSIS_PROFILE,
} from '../analysis/types/analysis-profile';
import { MarketTodayService } from '../market/market-today.service';
import { MarketTodayResult } from '../market/types/market-today';

@ApiTags('today')
@Controller('today')
export class TodayController {
  constructor(private readonly marketTodayService: MarketTodayService) {}

  @Get()
  @ApiOperation({
    summary: "Today's Move",
    description:
      'Concise actionable market setup from the shared scanner, profile, news, and events/catalyst pipeline.',
  })
  @ApiQuery({
    name: 'profile',
    required: false,
    enum: AnalysisProfile,
    description:
      'Analysis profile. SHORT_TERM prioritizes the next few trading days; LONG_TERM prioritizes multi-month opportunities. Defaults to SHORT_TERM.',
    example: DEFAULT_ANALYSIS_PROFILE,
  })
  @ApiOkResponse({ type: MarketTodayResult })
  @ApiServiceUnavailableResponse({
    description: 'Scanner returned no usable results.',
  })
  getToday(
    @Query(
      'profile',
      new DefaultValuePipe(DEFAULT_ANALYSIS_PROFILE),
      ParseAnalysisProfilePipe,
    )
    profile: AnalysisProfile,
  ): Promise<MarketTodayResult> {
    return this.marketTodayService.getToday(profile);
  }
}
