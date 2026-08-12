import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PortfolioService } from './portfolio.service';
import { CsvParseResult } from './types/portfolio';

@ApiTags('portfolio')
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get()
  @ApiOperation({
    summary: 'Current persisted portfolio',
    description:
      'Returns the server-persisted positions and upload metadata. uploadedAt is null when no portfolio has ever been uploaded.',
  })
  getPortfolio() {
    return this.portfolioService.getPortfolio();
  }

  @Post('parse-csv')
  @ApiOperation({
    summary: 'Parse a portfolio CSV (preview only, no persistence)',
    description:
      'Validates ticker,shares,avgCost,currentPrice (or Chase export) rows without fabricating data or saving them.',
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

  @Post('import')
  @ApiOperation({
    summary: 'Replace the persisted portfolio from a CSV',
    description:
      'Parses the Chase (or canonical) CSV format and REPLACES the entire stored portfolio. Rejects with parse errors when zero valid rows are found.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        csv: { type: 'string' },
        filename: { type: 'string', nullable: true },
      },
      required: ['csv'],
    },
  })
  @ApiBadRequestResponse({ description: 'No valid position rows in the CSV.' })
  importCsv(@Body() body: { csv?: string; filename?: string }) {
    return this.portfolioService.importCsv(
      body?.csv ?? '',
      body?.filename ?? null,
    );
  }

  @Post('positions')
  @ApiOperation({
    summary: 'Add or update a single position (merge by ticker)',
    description:
      'Does not replace the rest of the portfolio — only CSV import does that.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ticker: { type: 'string' },
        shares: { type: 'number' },
        avgCost: { type: 'number' },
        currentPrice: { type: 'number' },
      },
      required: ['ticker', 'shares', 'avgCost', 'currentPrice'],
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid position values.' })
  upsertPosition(
    @Body()
    body: {
      ticker: string;
      shares: number;
      avgCost: number;
      currentPrice: number;
    },
  ) {
    return this.portfolioService.upsertPosition(body);
  }

  @Delete('positions/:ticker')
  @ApiOperation({ summary: 'Remove a single held position by ticker' })
  removePosition(@Param('ticker') ticker: string) {
    return this.portfolioService.removePosition(ticker);
  }

  @Delete()
  @ApiOperation({
    summary: 'Clear the entire portfolio',
    description:
      'Resets the portfolio back to the "never uploaded" state (all positions cleared).',
  })
  clearPortfolio() {
    return this.portfolioService.clearPortfolio();
  }
}
