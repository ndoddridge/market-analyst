import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AnalysisProfile,
  DEFAULT_ANALYSIS_PROFILE,
} from '../../analysis/types/analysis-profile';
import { Recommendation } from '../../analysis/types/analysis-result';

export enum MarketDirection {
  BULLISH = 'BULLISH',
  BEARISH = 'BEARISH',
  MIXED = 'MIXED',
}

export enum CatalystType {
  NEWS = 'NEWS',
  EVENT = 'EVENT',
}

export class MarketTodayPick {
  @ApiProperty({ example: 'NVDA' })
  ticker: string;

  @ApiProperty({ enum: Recommendation, example: Recommendation.BUY })
  recommendation: Recommendation;

  @ApiProperty({ example: 89 })
  score: number;
}

export class MarketTodayCatalyst {
  @ApiProperty({ enum: CatalystType, example: CatalystType.NEWS })
  type: CatalystType;

  @ApiProperty({
    example: 'Apple CEO Tim Cook Just Passed His Successor a Mess',
  })
  headline: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'AAPL',
  })
  ticker: string | null;

  @ApiProperty({ example: '2026-08-09T22:20:00.000Z' })
  occurredAt: string;

  @ApiProperty({ example: 'Yahoo Finance' })
  source: string;
}

export class MarketTodayResult {
  @ApiProperty({
    enum: AnalysisProfile,
    example: DEFAULT_ANALYSIS_PROFILE,
  })
  profile: AnalysisProfile;

  @ApiProperty({ enum: MarketDirection, example: MarketDirection.BULLISH })
  marketDirection: MarketDirection;

  @ApiProperty({ type: MarketTodayPick })
  topOpportunity: MarketTodayPick;

  @ApiProperty({ type: MarketTodayPick })
  topRisk: MarketTodayPick;

  @ApiProperty({ type: MarketTodayCatalyst })
  catalyst: MarketTodayCatalyst;

  @ApiProperty({
    example:
      'SHORT_TERM setup is BULLISH: NVDA leads opportunities while AMD is the weakest score.',
  })
  summary: string;

  @ApiProperty({ example: '2026-08-09T23:50:00.000Z' })
  generatedAt: string;
}
