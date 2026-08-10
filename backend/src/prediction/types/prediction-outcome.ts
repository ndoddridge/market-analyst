import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Lifecycle status of a prediction evaluation attempt.
 * Separate from WIN/LOSS/OBSERVED classification.
 */
export enum EvaluationStatus {
  PENDING = 'PENDING',
  EVALUATED = 'EVALUATED',
  UNAVAILABLE = 'UNAVAILABLE',
  INVALID = 'INVALID',
}

/**
 * Directional / observational classification once an evaluation completes.
 */
export enum OutcomeClassification {
  WIN = 'WIN',
  LOSS = 'LOSS',
  BREAKEVEN = 'BREAKEVEN',
  /** WATCH/WAIT observations — not scored as directional wins/losses. */
  OBSERVED = 'OBSERVED',
}

export class PredictionOutcome {
  @ApiProperty()
  predictionId: string;

  @ApiProperty({ enum: EvaluationStatus })
  status: EvaluationStatus;

  @ApiProperty({
    description: 'When the outcome was evaluated (ISO).',
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
      'True/false for BUY/SELL directional correctness; null for WATCH/WAIT, flat, or non-evaluated states.',
  })
  directionallyCorrect: boolean | null;

  @ApiPropertyOptional({
    enum: OutcomeClassification,
    nullable: true,
    description: 'Set when status is EVALUATED; otherwise null.',
  })
  outcomeClassification: OutcomeClassification | null;

  @ApiProperty({
    description: 'Calendar days elapsed since prediction generation (market TZ).',
    example: 3,
  })
  daysElapsed: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Human-readable note for INVALID/UNAVAILABLE outcomes.',
  })
  detail: string | null;
}
