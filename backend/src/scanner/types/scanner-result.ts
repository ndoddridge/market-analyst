import { ApiProperty } from '@nestjs/swagger';
import {
  Recommendation,
  type HoldingWindow,
} from '../../analysis/types/analysis-result';
import { SuggestedHoldingWindow } from '../../analysis/types/analysis-summary';

export class ScannerResult {
  @ApiProperty({ example: 'NVDA' })
  ticker: string;

  @ApiProperty({ example: 'NVIDIA Corp' })
  companyName: string;

  @ApiProperty({ enum: Recommendation, example: Recommendation.BUY })
  recommendation: Recommendation;

  @ApiProperty({ example: 89 })
  score: number;

  @ApiProperty({ example: 0.86 })
  confidence: number;

  @ApiProperty({ type: SuggestedHoldingWindow })
  suggestedHoldingWindow: HoldingWindow;

  @ApiProperty({ example: 'Open a position.' })
  recommendedAction: string;
}
