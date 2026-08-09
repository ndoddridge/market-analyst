import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
      'Analyze the default watchlist (AAPL, MSFT, NVDA, AMD, META, TSM, SPY, QQQ) via the shared analysis pipeline and return results sorted by score (highest first).',
  })
  @ApiOkResponse({
    description: 'Ranked scanner results for the default watchlist.',
    type: [ScannerResult],
  })
  scan(): Promise<ScannerResult[]> {
    return this.scannerService.scan();
  }
}
