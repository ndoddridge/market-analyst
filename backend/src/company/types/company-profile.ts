import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompanyProfile {
  @ApiProperty({ example: 'AAPL' })
  symbol: string;

  @ApiProperty({ example: 'Apple Inc' })
  name: string;

  @ApiProperty({ example: 'NASDAQ' })
  exchange: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({ example: 'US' })
  country: string;

  @ApiProperty({ example: 4515140000000 })
  marketCapitalization: number;

  @ApiProperty({ example: 'Technology' })
  industry: string;

  @ApiProperty({ example: '1980-12-12' })
  ipoDate: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 'https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/AAPL.svg',
  })
  logoUrl: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 'https://www.apple.com/',
  })
  website: string | null;

  @ApiProperty({ example: 'Finnhub' })
  source: string;
}
