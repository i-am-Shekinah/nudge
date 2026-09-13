import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { GmailModule } from './modules/gmail/gmail.module.js';
import { ScannerModule } from './modules/scanner/scanner.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { CalendarModule } from './modules/calendar/calendar.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { AppSchedulerModule } from './modules/scheduler/scheduler.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    PrismaModule,
    AuthModule,
    GmailModule,
    ScannerModule,
    EventsModule,
    CalendarModule,
    NotificationsModule,
    AppSchedulerModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
