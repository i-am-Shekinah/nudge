import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EventStatus } from '@prisma/client';

@Injectable()
export class AutoDeleteOrchestrator {
  private readonly logger = new Logger(AutoDeleteOrchestrator.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Daily cleanup sweep running at 02:00 UTC.
   * Sweeps events whose 7-day post-event retention window (autoDeleteAt) has elapsed.
   */
  @Cron('0 2 * * *')
  async sweepExpiredEvents() {
    try {
      const now = new Date();

      const expiredEvents = await this.prisma.detectedEvent.findMany({
        where: {
          autoDeleteAt: {
            lte: now,
          },
          status: {
            in: [EventStatus.COMPLETED, EventStatus.EXPIRED, EventStatus.IGNORED],
          },
        },
      });

      if (expiredEvents.length === 0) {
        return;
      }

      this.logger.log(`Found ${expiredEvents.length} expired events to auto-delete`);

      const result = await this.prisma.detectedEvent.deleteMany({
        where: {
          id: {
            in: expiredEvents.map((e) => e.id),
          },
        },
      });

      this.logger.log(`Auto-deleted ${result.count} expired events.`);
    } catch (err: any) {
      this.logger.error(`Error in auto-delete sweep: ${err.message}`);
    }
  }
}
