import { ApiProperty } from '@nestjs/swagger';

export class RecommendationReturnStats {
  @ApiProperty()
  count: number;

  @ApiProperty({ nullable: true, type: Number })
  averageReturn: number | null;
}

export class GroupScorecardStats {
  @ApiProperty()
  key: string;

  @ApiProperty()
  count: number;

  @ApiProperty()
  evaluatedCount: number;

  @ApiProperty({ nullable: true, type: Number })
  directionalAccuracy: number | null;

  @ApiProperty({ nullable: true, type: Number })
  averageReturn: number | null;
}

export class PredictionHistoryScorecard {
  @ApiProperty()
  totalPredictions: number;

  @ApiProperty()
  evaluatedPredictions: number;

  @ApiProperty()
  pendingPredictions: number;

  @ApiProperty()
  unavailablePredictions: number;

  @ApiProperty()
  invalidPredictions: number;

  @ApiProperty()
  buyCount: number;

  @ApiProperty()
  sellCount: number;

  @ApiProperty()
  watchWaitCount: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Directional accuracy among evaluated BUY/SELL with a true/false result.',
  })
  directionalAccuracy: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Average return across EVALUATED predictions with a return percentage.',
  })
  averageReturn: number | null;

  @ApiProperty()
  averageReturnByRecommendation: Record<string, RecommendationReturnStats>;

  @ApiProperty({ type: [GroupScorecardStats] })
  byTicker: GroupScorecardStats[];

  @ApiProperty({ type: [GroupScorecardStats] })
  bySetupQuality: GroupScorecardStats[];

  @ApiProperty({ type: [GroupScorecardStats] })
  byScoreBucket: GroupScorecardStats[];
}
