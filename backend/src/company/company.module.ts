import { Module } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { CompanyProvider } from './company.provider';

@Module({
  controllers: [CompanyController],
  providers: [CompanyService, CompanyProvider, ConfigService],
  exports: [CompanyService],
})
export class CompanyModule {}
