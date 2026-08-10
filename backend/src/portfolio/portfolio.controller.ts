import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PortfolioService } from './portfolio.service';
import {
  AnalyzePortfolioRequest,
  CsvParseResult,
  PortfolioAnalysisResult,
} from './types/portfolio';

@ApiTags('portfolio')
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Post('parse-csv')
  @ApiOperation({
    summary: 'Parse a portfolio CSV',
    description:
      'Validates ticker,shares,avgCost,currentPrice rows without fabricating data.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { csv: { type: 'string' } },
      required: ['csv'],
    },
  })
  @ApiOkResponse({ type: CsvParseResult })
  parseCsv(@Body() body: { csv?: string }): CsvParseResult {
    return this.portfolioService.parseCsv(body?.csv ?? '');
  }

  @Post('analyze')
  @ApiOperation({
    summary: 'Analyze current positions with SHORT_TERM evidence',
    description:
      'Runs existing SHORT_TERM scanner/decision evidence for each held ticker and returns personalized ADD/HOLD/REDUCE/SELL/WATCH moves.',
  })
  @ApiBody({ type: AnalyzePortfolioRequest })
  @ApiOkResponse({ type: PortfolioAnalysisResult })
  @ApiBadRequestResponse({ description: 'Invalid or empty positions payload.' })
  analyze(
    @Body() body: AnalyzePortfolioRequest,
  ): Promise<PortfolioAnalysisResult> {
    return this.portfolioService.analyze(body);
  }
}
