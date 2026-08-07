import { ApiProperty } from '@nestjs/swagger';

export class HistoricalCandle {
  @ApiProperty({ example: '2026-02-03T00:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: 185.12 })
  open: number;

  @ApiProperty({ example: 187.45 })
  high: number;

  @ApiProperty({ example: 184.9 })
  low: number;

  @ApiProperty({ example: 186.75 })
  close: number;

  @ApiProperty({ example: 52431800 })
  volume: number;
}

export enum HistoryRange {
  OneMonth = '1m',
  ThreeMonths = '3m',
  SixMonths = '6m',
  OneYear = '1y',
}

export class HistoricalPriceResponse {
  @ApiProperty({ example: 'AAPL' })
  symbol: string;

  @ApiProperty({ enum: HistoryRange, example: HistoryRange.SixMonths })
  range: HistoryRange;

  @ApiProperty({ type: [HistoricalCandle] })
  candles: HistoricalCandle[];
}
