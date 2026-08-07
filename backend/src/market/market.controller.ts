import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MarketService } from './market.service';
import { MarketQuote } from './types/market-quote';

@ApiTags('market')
@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get()
  getStatus(): string {
    return this.marketService.getStatus();
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
