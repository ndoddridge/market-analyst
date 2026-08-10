import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvaluatePredictionDto {
  @ApiPropertyOptional({
    description:
      'Optional evaluation price for deterministic testing. When omitted, the live market quote provider is used.',
    example: 214.5,
  })
  evaluationPrice?: number;

  @ApiPropertyOptional({
    description:
      'Optional evaluation timestamp (ISO). Defaults to now. Used with evaluationPrice for deterministic fixtures.',
    example: '2026-08-05T20:00:00.000Z',
  })
  evaluatedAt?: string;
}
