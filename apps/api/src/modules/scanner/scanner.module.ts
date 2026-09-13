import { Module } from '@nestjs/common';
import { GmailModule } from '../gmail/gmail.module.js';
import { AiModule } from '../ai/ai.module.js';
import { EventsModule } from '../events/events.module.js';
import { ScannerService } from './scanner.service.js';
import { ScannerController } from './scanner.controller.js';

@Module({
  imports: [GmailModule, AiModule, EventsModule],
  controllers: [ScannerController],
  providers: [ScannerService],
  exports: [ScannerService],
})
export class ScannerModule {}
