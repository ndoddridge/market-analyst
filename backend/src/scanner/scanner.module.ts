import { Module, forwardRef } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { ScannerController } from './scanner.controller';
import { ScannerService } from './scanner.service';

@Module({
  imports: [forwardRef(() => AnalysisModule)],
  controllers: [ScannerController],
  providers: [ScannerService],
  exports: [ScannerService],
})
export class ScannerModule {}
