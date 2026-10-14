import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class AutoDeleteOrchestrator {
  private readonly logger = new Logger(AutoDeleteOrchestrator.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Daily cleanup sweep running at 02:00 UTC.
   * Deletes every event past its 7-day post-event retention window
   * (autoDeleteAt), regardless of status — this is what the Settings
   * page and Privacy Policy disclose.
   */
  @Cron('0 2 * * *')
  async sweepExpiredEvents() {
    try {
      const result = await this.prisma.detectedEvent.deleteMany({
        where: {
          autoDeleteAt: {
            lte: new Date(),
          },
        },
      });

      if (result.count > 0) {
        this.logger.log(`Auto-deleted ${result.count} events past retention.`);
      }
    } catch (err: any) {
      this.logger.error(`Error in auto-delete sweep: ${err.message}`);
    }
  }
}
