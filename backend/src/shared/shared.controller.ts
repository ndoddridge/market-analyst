import { Controller, Get } from '@nestjs/common';
import { SharedService } from './shared.service';

@Controller('shared')
export class SharedController {
  constructor(private readonly sharedService: SharedService) {}

  @Get()
  getStatus(): string {
    return this.sharedService.getStatus();
  }
}
