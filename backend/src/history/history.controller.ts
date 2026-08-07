import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HistoryService } from './history.service';
import {
  HistoricalPriceResponse,
  HistoryRange,
} from './types/historical-candle';

@ApiTags('history')
@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get(':symbol')
  @ApiOperation({ description: 'Retrieve historical daily price data.' })
  @ApiParam({
    name: 'symbol',
    description: 'Ticker symbol',
    example: 'AAPL',
  })
  @ApiQuery({
    name: 'range',
    required: false,
    enum: HistoryRange,
    description: 'Lookback window for daily candles. Defaults to 6m.',
    example: HistoryRange.SixMonths,
  })
  @ApiOkResponse({ type: HistoricalPriceResponse })
  @ApiBadRequestResponse({ description: 'Invalid range value.' })
  @ApiNotFoundResponse({
    description: 'Historical data not found for the given symbol.',
  })
  @ApiBadGatewayResponse({
    description: 'Upstream historical data provider failed.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Historical data provider authentication failed.',
  })
  getHistory(
    @Param('symbol') symbol: string,
    @Query('range') range?: string,
  ): Promise<HistoricalPriceResponse> {
    const resolvedRange = this.resolveRange(range);
    return this.historyService.getHistory(symbol, resolvedRange);
  }

  private resolveRange(range?: string): HistoryRange {
    if (range == null || range === '') {
      return HistoryRange.SixMonths;
    }

    const values = Object.values(HistoryRange) as string[];
    if (!values.includes(range)) {
      throw new BadRequestException(
        `Invalid range "${range}". Supported values: ${values.join(', ')}`,
      );
    }

    return range as HistoryRange;
  }
}
