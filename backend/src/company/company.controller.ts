import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CompanyService } from './company.service';
import { CompanyProfile } from './types/company-profile';

@ApiTags('companies')
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get(':symbol')
  @ApiOperation({ description: 'Retrieve company profile information.' })
  @ApiParam({
    name: 'symbol',
    description: 'Ticker symbol',
    example: 'AAPL',
  })
  @ApiOkResponse({ type: CompanyProfile })
  @ApiNotFoundResponse({
    description: 'Company profile not found for the given symbol.',
  })
  @ApiBadGatewayResponse({
    description: 'Upstream company data provider failed.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Company data provider authentication failed.',
  })
  getCompanyProfile(
    @Param('symbol') symbol: string,
  ): Promise<CompanyProfile> {
    return this.companyService.getCompanyProfile(symbol);
  }
}
