import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AnalysisProfile,
  DEFAULT_ANALYSIS_PROFILE,
} from '../../analysis/types/analysis-profile';
import {
  PortfolioBuyCandidate,
  PortfolioSummary,
  PositionAnalysisCard,
} from '../../portfolio/types/portfolio';
import { MarketStatus } from '../../shared/types/market-status';

export enum TodaysMoveAction {
  SELL = 'SELL',
  REDUCE = 'REDUCE',
  BUY = 'BUY',
  ADD = 'ADD',
  HOLD = 'HOLD',
  WATCH = 'WATCH',
  WAIT = 'WAIT',
}

export class TodaysMove {
  @ApiPropertyOptional({ nullable: true, example: 'NVDA' })
  ticker: string | null;

  @ApiProperty({ enum: TodaysMoveAction, example: TodaysMoveAction.BUY })
  action: TodaysMoveAction;

  @ApiPropertyOptional({ nullable: true, example: 182.4 })
  currentPrice: number | null;

  @ApiProperty({
    example: 82,
    description: 'Signal score used as a confidence proxy, 0-100.',
  })
  confidence: number;

  @ApiProperty({
    example:
      'NVDA ranks first with strong scanner momentum and a supportive catalyst.',
  })
  reason: string;
}

export class DashboardStaleness {
  @ApiProperty({ example: false })
  isStale: boolean;

  @ApiPropertyOptional({ nullable: true })
  lastSuccessfulRefreshAt: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastAttemptError: string | null;
}

export class DashboardSnapshot {
  @ApiProperty({ enum: AnalysisProfile, example: DEFAULT_ANALYSIS_PROFILE })
  profile: AnalysisProfile;

  @ApiProperty()
  generatedAt: string;

  @ApiProperty({ type: MarketStatus })
  marketStatus: MarketStatus;

  @ApiProperty({
    description:
      'False only when a portfolio CSV/manual position has never been saved.',
  })
  portfolioEverUploaded: boolean;

  @ApiProperty({ type: TodaysMove })
  todaysMove: TodaysMove;

  @ApiProperty({ type: [PositionAnalysisCard] })
  positions: PositionAnalysisCard[];

  @ApiPropertyOptional({ type: PortfolioSummary, nullable: true })
  summary: PortfolioSummary | null;

  @ApiProperty({ type: [PortfolioBuyCandidate] })
  buyCandidates: PortfolioBuyCandidate[];

  @ApiPropertyOptional({ nullable: true })
  buyCandidatesNote: string | null;

  @ApiProperty({ type: DashboardStaleness })
  staleness: DashboardStaleness;
}
