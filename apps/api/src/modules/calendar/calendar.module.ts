import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CalendarService } from './calendar.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [AuthModule, NotificationsModule],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
