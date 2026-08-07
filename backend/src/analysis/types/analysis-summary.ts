import { ApiProperty } from '@nestjs/swagger';
import { Recommendation, type HoldingWindow } from './analysis-result';
import { Strategy } from './strategy';

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export class SuggestedHoldingWindow {
  @ApiProperty({ example: 5 })
  minDays: number;

  @ApiProperty({ example: 10 })
  maxDays: number;
}

export class AnalysisSummary {
  @ApiProperty({ example: 'AAPL' })
  ticker: string;

  @ApiProperty({ example: 'Apple Inc' })
  companyName: string;

  @ApiProperty({ enum: Recommendation, example: Recommendation.BUY })
  recommendation: Recommendation;

  @ApiProperty({ example: 80 })
  score: number;

  @ApiProperty({ example: 0.6 })
  confidence: number;

  @ApiProperty({ type: SuggestedHoldingWindow })
  suggestedHoldingWindow: HoldingWindow;

  @ApiProperty({ enum: RiskLevel, example: RiskLevel.MEDIUM })
  riskLevel: RiskLevel;

  @ApiProperty({
    type: [String],
    example: [
      'Apple Inc is currently a large-cap U.S. company with a high share price.',
      'Trend: BULLISH with HIGH strength.',
      'Large-cap company',
    ],
  })
  summary: string[];

  @ApiProperty({ type: Strategy })
  strategy: Strategy;

  @ApiProperty({ example: true })
  detailsAvailable: boolean;
}
