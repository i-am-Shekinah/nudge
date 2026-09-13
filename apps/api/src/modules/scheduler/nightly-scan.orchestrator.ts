import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ScannerService } from '../scanner/scanner.service.js';
import { getNextMidnight } from '../../common/timezone.util.js';

@Injectable()
export class NightlyScanOrchestrator {
  private readonly logger = new Logger(NightlyScanOrchestrator.name);
  private isTicking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scannerService: ScannerService,
  ) {}

  /**
   * Evaluates due midnight scans every 60 seconds.
   * Catches all global timezones (including half-hour and quarter-hour offsets).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchDueNightlyScans() {
    if (this.isTicking) return;
    this.isTicking = true;

    try {
      const now = new Date();

      // Indexed query: only fetches users whose scheduled midnight has arrived
      const dueUsers = await this.prisma.user.findMany({
        where: {
          gmailConnected: true,
          nextScanAt: {
            lte: now,
          },
        },
      });

      if (dueUsers.length === 0) {
        return;
      }

      this.logger.log(`Found ${dueUsers.length} user(s) due for nightly midnight scan`);

      for (const user of dueUsers) {
        // LAYER 1: Advance nextScanAt to tomorrow's midnight immediately to prevent double-picking!
        const nextMidnightUtc = getNextMidnight(user.timezone, now);

        await this.prisma.user.update({
          where: { id: user.id },
          data: { nextScanAt: nextMidnightUtc },
        });

        // 24-hour lookback window (from yesterday midnight to today midnight)
        const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const windowEnd = now;

        const scanLog = await this.prisma.scanLog.create({
          data: {
            userId: user.id,
            status: 'RUNNING',
            windowStart,
            windowEnd,
            emailsScanned: 0,
            eventsDetected: 0,
          },
        });

        // Execute scan asynchronously
        this.scannerService
          .runScanPipeline(user.id, scanLog.id, windowStart, windowEnd, user.timezone)
          .catch((err) => {
            this.logger.error(`Nightly scan failed for user ${user.id}: ${err.message}`);
          });
      }
    } catch (err: any) {
      this.logger.error(`Error in nightly scan orchestrator tick: ${err.message}`);
    } finally {
      this.isTicking = false;
    }
  }
}
