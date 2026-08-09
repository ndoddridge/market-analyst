import { ApiProperty } from '@nestjs/swagger';
import {
  AnalysisProfile,
  DEFAULT_ANALYSIS_PROFILE,
} from '../../analysis/types/analysis-profile';
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

  @ApiProperty({
    enum: AnalysisProfile,
    example: DEFAULT_ANALYSIS_PROFILE,
  })
  profile: AnalysisProfile;

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
