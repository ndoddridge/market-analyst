import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum OutcomeClassification {
  WIN = 'WIN',
  LOSS = 'LOSS',
  BREAKEVEN = 'BREAKEVEN',
  /** WATCH/WAIT observations — not scored as directional wins/losses. */
  OBSERVED = 'OBSERVED',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
}

export class PredictionOutcome {
  @ApiProperty()
  predictionId: string;

  @ApiProperty({
    description: 'When the outcome was evaluated (market-timezone ISO).',
  })
  evaluatedAt: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Price used for evaluation when available.',
  })
  priceAtEvaluation: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Percent return from entry/reference price to evaluation price.',
  })
  returnPercentage: number | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'True/false for BUY/SELL directional correctness; null for WATCH/WAIT or missing data.',
  })
  directionallyCorrect: boolean | null;

  @ApiProperty({ enum: OutcomeClassification })
  outcomeClassification: OutcomeClassification;

  @ApiProperty({
    description: 'Calendar days elapsed since prediction generation (market TZ).',
    example: 3,
  })
  daysElapsed: number;
}
