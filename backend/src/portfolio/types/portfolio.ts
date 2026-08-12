import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MarketDirection,
  SetupQuality,
  TodayAction,
  type MarketTodayCatalyst,
} from '../../market/types/market-today';
import { EstimatedOpen } from '../../market/types/estimated-open';

export enum PositionMove {
  ADD = 'ADD',
  HOLD = 'HOLD',
  REDUCE = 'REDUCE',
  SELL = 'SELL',
  WATCH = 'WATCH',
}

export class PortfolioPositionInput {
  @ApiProperty({ example: 'AAPL' })
  ticker: string;

  @ApiProperty({ example: 10 })
  shares: number;

  @ApiProperty({ example: 285 })
  avgCost: number;

  @ApiProperty({ example: 313.33 })
  currentPrice: number;
}

export class AnalyzePortfolioRequest {
  @ApiProperty({ type: [PortfolioPositionInput] })
  positions: PortfolioPositionInput[];
}

export class PositionAnalysisCard {
  @ApiProperty({ example: 'AAPL' })
  ticker: string;

  @ApiProperty({ example: 10 })
  shares: number;

  @ApiProperty({ example: 285 })
  avgCost: number;

  @ApiProperty({ example: 313.33 })
  currentPrice: number;

  @ApiProperty({ example: 9.94 })
  unrealizedPlPercent: number;

  @ApiProperty({ example: 3133.3 })
  marketValue: number;

  @ApiProperty({ example: 283.3 })
  unrealizedPlValue: number;

  @ApiProperty({ enum: TodayAction, example: TodayAction.WATCH })
  scannerRecommendation: TodayAction;

  @ApiProperty({ example: 74 })
  signalScore: number;

  @ApiProperty({ example: 62 })
  catalystScore: number;

  @ApiProperty({ enum: SetupQuality, example: SetupQuality.MODERATE })
  setupQuality: SetupQuality;

  @ApiPropertyOptional({ nullable: true, type: Object })
  catalyst: MarketTodayCatalyst | null;

  @ApiProperty({ enum: MarketDirection })
  marketDirection: MarketDirection;

  @ApiProperty({ enum: PositionMove, example: PositionMove.HOLD })
  recommendedMove: PositionMove;

  @ApiProperty({
    example:
      'Scanner evidence remains bullish, but catalyst strength and setup quality do not justify adding at this time.',
  })
  reason: string;

  @ApiPropertyOptional({
    type: EstimatedOpen,
    nullable: true,
    description:
      'Next-session open range estimate, only present when sufficient extended-hours data exists.',
  })
  estimatedOpen: EstimatedOpen | null;
}

export class PortfolioActionSummaryItem {
  @ApiProperty({ enum: PositionMove })
  move: PositionMove;

  @ApiProperty({ example: 'AAPL' })
  ticker: string;
}

export class PortfolioSummary {
  @ApiProperty({ example: 4800.5 })
  portfolioValue: number;

  @ApiProperty({ example: 215.4 })
  totalUnrealizedPlValue: number;

  @ApiProperty({ example: 4.7 })
  totalUnrealizedPlPercent: number;

  @ApiProperty({ example: 3 })
  positions: number;

  @ApiPropertyOptional({ nullable: true, example: 'AAPL' })
  strongestPosition: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'AMD' })
  weakestPosition: string | null;

  @ApiProperty({ type: [PortfolioActionSummaryItem] })
  recommendedActions: PortfolioActionSummaryItem[];
}

export class PortfolioBuyCandidate {
  @ApiProperty()
  ticker: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Null when a live quote could not be fetched — never fabricated as 0.',
  })
  currentPrice: number | null;

  @ApiProperty()
  priceUnavailable: boolean;

  @ApiProperty()
  signalScore: number;

  @ApiProperty({ enum: TodayAction })
  recommendation: TodayAction;

  @ApiProperty({ enum: SetupQuality })
  setupQuality: SetupQuality;

  @ApiPropertyOptional({ nullable: true, type: Object })
  catalyst: MarketTodayCatalyst | null;

  @ApiProperty()
  reason: string;
}

export class PortfolioAnalysisResult {
  @ApiProperty({ type: PortfolioSummary })
  summary: PortfolioSummary;

  @ApiProperty({ type: [PositionAnalysisCard] })
  positions: PositionAnalysisCard[];

  @ApiProperty({ type: [PortfolioBuyCandidate] })
  buyCandidates: PortfolioBuyCandidate[];

  @ApiPropertyOptional({ nullable: true })
  buyCandidatesNote: string | null;

  @ApiProperty()
  generatedAt: string;
}

export class CsvParseError {
  @ApiProperty()
  line: number;

  @ApiProperty()
  message: string;
}

export class CsvParseResult {
  @ApiProperty({ type: [PortfolioPositionInput] })
  positions: PortfolioPositionInput[];

  @ApiProperty({ type: [CsvParseError] })
  errors: CsvParseError[];
}
