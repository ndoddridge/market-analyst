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
    description:
      'Scan a configured watchlist and return ranked analysis summaries.',
  })
  @ApiOkResponse({ type: [ScannerResult] })
  scan(): Promise<ScannerResult[]> {
    return this.scannerService.scan();
  }
}
