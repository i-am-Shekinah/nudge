import { Controller, Post, Get } from '@nestjs/common';
import { ScannerService } from './scanner.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller()
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Post('gmail/backfill')
  async triggerBackfill(@CurrentUser('id') userId: string) {
    return this.scannerService.triggerBackfill(userId);
  }

  @Get('scans/latest')
  async getLatestScan(@CurrentUser('id') userId: string) {
    const scan = await this.scannerService.getLatestScan(userId);
    return { scan };
  }
}
