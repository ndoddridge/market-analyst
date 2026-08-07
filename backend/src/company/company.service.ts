import { Injectable } from '@nestjs/common';
import { CompanyProvider } from './company.provider';
import type { CompanyProfile } from './types/company-profile';

@Injectable()
export class CompanyService {
  constructor(private readonly companyProvider: CompanyProvider) {}

  getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    return this.companyProvider.getCompanyProfile(symbol);
  }
}
