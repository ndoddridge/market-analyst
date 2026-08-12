import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MarketStatus {
  @ApiProperty({ example: true })
  isOpen: boolean;

  @ApiProperty({ example: '2026-08-12T09:30:00.000-04:00' })
  nextOpenAt: string;

  @ApiPropertyOptional({
    nullable: true,
    example: '2026-08-11T16:00:00.000-04:00',
  })
  nextCloseAt: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: '2026-08-08T16:00:00.000-04:00',
  })
  lastCloseAt: string | null;
}
