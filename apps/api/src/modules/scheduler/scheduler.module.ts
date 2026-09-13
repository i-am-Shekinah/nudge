import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ScannerModule } from '../scanner/scanner.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { NightlyScanOrchestrator } from './nightly-scan.orchestrator.js';
import { MorningNotifyOrchestrator } from './morning-notify.orchestrator.js';
import { AutoDeleteOrchestrator } from './auto-delete.orchestrator.js';

@Module({
  imports: [ScheduleModule.forRoot(), ScannerModule, NotificationsModule],
  providers: [
    NightlyScanOrchestrator,
    MorningNotifyOrchestrator,
    AutoDeleteOrchestrator,
  ],
  exports: [
    NightlyScanOrchestrator,
    MorningNotifyOrchestrator,
    AutoDeleteOrchestrator,
  ],
})
export class AppSchedulerModule {}
