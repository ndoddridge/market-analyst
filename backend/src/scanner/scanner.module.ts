import { Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { ScannerController } from './scanner.controller';
import { ScannerService } from './scanner.service';

@Module({
  imports: [AnalysisModule],
  controllers: [ScannerController],
  providers: [ScannerService],
})
export class ScannerModule {}
