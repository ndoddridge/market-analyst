import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { PredictionService } from './prediction.service';
import { PredictionRecord } from './types/prediction';

@ApiTags('predictions')
@Controller('predictions')
export class PredictionController {
  constructor(private readonly predictionService: PredictionService) {}

  @Get()
  @ApiOperation({
    summary: 'Inspect recent prediction ledger entries',
    description:
      'Developer-facing list of recent SHORT_TERM predictions and evaluation status.',
  })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  inspectRecent(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.predictionService.inspectRecent(limit);
  }

  @Get('ticker/:symbol')
  @ApiOperation({
    summary: 'Prediction history for a ticker',
    description:
      'Historical SHORT_TERM prediction records for a symbol (separate from OHLCV /history/:symbol).',
  })
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ type: [PredictionRecord] })
  listByTicker(
    @Param('symbol') symbol: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<PredictionRecord[]> {
    return this.predictionService.listByTicker(symbol, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a prediction by id' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: PredictionRecord })
  @ApiNotFoundResponse()
  getById(@Param('id') id: string): Promise<PredictionRecord> {
    return this.predictionService.getById(id);
  }

  @Post(':id/evaluate')
  @ApiOperation({
    summary: 'Evaluate a prediction against the current market price',
    description:
      'Attaches an outcome without rewriting the original prediction snapshot.',
  })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ type: PredictionRecord })
  @ApiNotFoundResponse()
  evaluate(@Param('id') id: string): Promise<PredictionRecord> {
    return this.predictionService.evaluate(id);
  }
}
