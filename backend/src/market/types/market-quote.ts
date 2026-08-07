import { ApiProperty } from '@nestjs/swagger';

export class MarketQuote {
  @ApiProperty({ example: 'AAPL' })
  symbol: string;

  @ApiProperty({ example: 213.42 })
  price: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: '2026-08-05T18:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: 'Finnhub' })
  source: string;
}
