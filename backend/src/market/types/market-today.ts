import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AnalysisProfile,
  DEFAULT_ANALYSIS_PROFILE,
} from '../../analysis/types/analysis-profile';

export enum MarketDirection {
  BULLISH = 'BULLISH',
  BEARISH = 'BEARISH',
  NEUTRAL = 'NEUTRAL',
}

export enum CatalystType {
  NEWS = 'NEWS',
  EVENT = 'EVENT',
}

/**
 * Presentation actions for /today picks.
 * WAIT is SHORT_TERM-only when near-term evidence is weak/unclear.
 */
export enum TodayAction {
  BUY = 'BUY',
  WATCH = 'WATCH',
  WAIT = 'WAIT',
  HOLD = 'HOLD',
  SELL = 'SELL',
}

export enum SetupQuality {
  STRONG = 'STRONG',
  MODERATE = 'MODERATE',
  WEAK = 'WEAK',
}

export class MarketTodayPick {
  @ApiProperty({ example: 'NVDA' })
  ticker: string;

  @ApiProperty({ enum: TodayAction, example: TodayAction.BUY })
  recommendation: TodayAction;

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

  @ApiProperty({
    description: 'Catalyst date (news publish time or event date).',
    example: '2026-08-09T22:20:00.000Z',
  })
  date: string;

  @ApiProperty({ example: 'Yahoo Finance' })
  source: string;
}

export class DecisionEvidence {
  @ApiProperty({
    description: 'Scanner-derived signal score for the top opportunity.',
    example: 89,
  })
  signalScore: number;

  @ApiProperty({
    description:
      '0–100 strength/relevance of the catalyst for a 1–5 day trade; 0 when none.',
    example: 86,
  })
  catalystScore: number;

  @ApiProperty({ enum: SetupQuality, example: SetupQuality.STRONG })
  setupQuality: SetupQuality;

  @ApiProperty({
    description:
      'Concise explanation of why the opportunity ranked where it did.',
    example:
      'NVDA ranks first: strong scanner momentum with a high-impact earnings catalyst inside 1–5 sessions.',
  })
  reason: string;
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

  @ApiPropertyOptional({
    type: MarketTodayCatalyst,
    nullable: true,
    description:
      'Real news/event catalyst when available; null when none can be identified.',
  })
  catalyst: MarketTodayCatalyst | null;

  @ApiPropertyOptional({
    type: DecisionEvidence,
    nullable: true,
    description:
      'SHORT_TERM structured decision evidence. Null for LONG_TERM.',
  })
  decision: DecisionEvidence | null;

  @ApiProperty({
    description:
      'Concise explanation of why the top opportunity ranked first for this profile.',
    example:
      'NVDA wins on near-term setup with upcoming catalyst within 1–5 sessions (Earnings) and supportive scanner momentum (score 89).',
  })
  reason: string;

  @ApiProperty({
    example:
      'SHORT_TERM setup is BULLISH over the next few trading days: NVDA leads while AMD is the weakest score. Catalyst: NVIDIA demand stays strong (Yahoo Finance).',
  })
  summary: string;

  @ApiProperty({ example: '2026-08-09T23:50:00.000Z' })
  generatedAt: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Ledger id for the recorded SHORT_TERM prediction snapshot. Null for LONG_TERM or when not recorded.',
    example: 'pred_01HZXEXAMPLE',
  })
  predictionId: string | null;
}
