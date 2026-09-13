import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SettingsService } from './settings.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings(@CurrentUser('id') userId: string) {
    return this.settingsService.getSettings(userId);
  }

  @Patch()
  async updateSettings(
    @CurrentUser('id') userId: string,
    @Body() body: { timezone?: string; notificationTime?: string },
  ) {
    return this.settingsService.updateSettings(userId, body);
  }

  @Get('reminders')
  async getReminders(@CurrentUser('id') userId: string) {
    return this.settingsService.getReminders(userId);
  }

  @Patch('reminders')
  async updateReminders(
    @CurrentUser('id') userId: string,
    @Body() body: { reminders: number[] },
  ) {
    return this.settingsService.updateReminders(userId, body.reminders || []);
  }

  @Post('reminders/reset')
  @HttpCode(HttpStatus.OK)
  async resetReminders(@CurrentUser('id') userId: string) {
    return this.settingsService.resetReminders(userId);
  }

  @Public()
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.settingsService.getVapidPublicKey() };
  }

  @Post('push-subscription')
  @HttpCode(HttpStatus.OK)
  async savePushSubscription(
    @CurrentUser('id') userId: string,
    @Body() body: { subscription: any },
  ) {
    await this.settingsService.savePushSubscription(userId, body.subscription);
    return { success: true, message: 'Push subscription saved' };
  }
}
