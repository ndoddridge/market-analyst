import { ApiProperty } from '@nestjs/swagger';

export class Strategy {
  @ApiProperty({ example: 'Open a position.' })
  recommendedAction: string;

  @ApiProperty({ example: 'Enter on the next session open or on a shallow pullback.' })
  entryStrategy: string;

  @ApiProperty({ example: 'Within 1-2 trading days if thesis remains intact.' })
  entryWindow: string;

  @ApiProperty({ example: '75% of planned allocation.' })
  positionSizing: string;

  @ApiProperty({ example: '5-10 trading days.' })
  holdingPeriod: string;

  @ApiProperty({
    example: 'Take profits after 8-12% gain or weakening momentum.',
  })
  exitStrategy: string;

  @ApiProperty({
    example: 'Moderate risk; size for volatility and avoid over-concentration.',
  })
  riskSummary: string;
}
