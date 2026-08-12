import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum GapDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  FLAT = 'FLAT',
}

/**
 * A RANGE estimate for the next session's open — never a guaranteed price.
 * `available` is false (all other fields null) whenever the underlying
 * previous-close/extended-hours data is missing, rather than inventing a value.
 */
export class EstimatedOpen {
  @ApiProperty({ example: true })
  available: boolean;

  @ApiPropertyOptional({ nullable: true, example: 182.1 })
  lowEstimate: number | null;

  @ApiPropertyOptional({ nullable: true, example: 184.4 })
  highEstimate: number | null;

  @ApiPropertyOptional({ nullable: true, example: 1.12 })
  estimatedChangePercent: number | null;

  @ApiPropertyOptional({ enum: GapDirection, nullable: true })
  gapDirection: GapDirection | null;

  @ApiPropertyOptional({
    nullable: true,
    example:
      "Estimated from Yahoo Finance's extended-hours quote and today's trading range; not a guaranteed price.",
  })
  method: string | null;
}
