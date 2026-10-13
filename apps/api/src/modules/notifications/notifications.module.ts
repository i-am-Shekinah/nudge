import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { FcmService } from './fcm.service.js';

@Module({
  providers: [NotificationsService, FcmService],
  exports: [NotificationsService, FcmService],
})
export class NotificationsModule {}
