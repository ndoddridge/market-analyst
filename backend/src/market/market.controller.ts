import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ParseAnalysisProfilePipe } from '../analysis/parse-analysis-profile.pipe';
import {
  AnalysisProfile,
  DEFAULT_ANALYSIS_PROFILE,
} from '../analysis/types/analysis-profile';
import { MarketTodayService } from './market-today.service';
import { MarketService } from './market.service';
import { MarketTodayResult } from './types/market-today';
import { MarketQuote } from './types/market-quote';

@ApiTags('market')
@Controller('market')
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly marketTodayService: MarketTodayService,
  ) {}

  @Get()
  getStatus(): string {
    return this.marketService.getStatus();
  }

  @Get('today')
  @ApiOperation({
    summary: "Today's Move",
    description:
      'Concise market overview derived from the shared scanner/analysis pipeline for the selected profile.',
  })
  @ApiQuery({
    name: 'profile',
    required: false,
    enum: AnalysisProfile,
    description:
      'Analysis profile controlling scoring emphasis. Defaults to SHORT_TERM.',
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

  @Get(':symbol')
  @ApiOperation({ description: 'Retrieve the latest market quote.' })
  @ApiParam({
    name: 'symbol',
    description: 'Ticker symbol',
    example: 'AAPL',
  })
  @ApiOkResponse({ type: MarketQuote })
  @ApiNotFoundResponse({ description: 'Quote not found for the given symbol.' })
  @ApiBadGatewayResponse({
    description: 'Upstream market data provider failed.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Market data provider authentication failed.',
  })
  getQuote(@Param('symbol') symbol: string): Promise<MarketQuote> {
    return this.marketService.getQuote(symbol);
  }
}
