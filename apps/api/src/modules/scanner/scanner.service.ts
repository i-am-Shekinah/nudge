import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { GmailService } from '../gmail/gmail.service.js';
import { filterEmailHeuristically } from '../gmail/email-filter.util.js';
import { AiService } from '../ai/ai.service.js';
import { EventsService } from '../events/events.service.js';
import { ScanStatus } from '@prisma/client';

@Injectable()
export class ScannerService {
  private readonly logger = new Logger(ScannerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailService: GmailService,
    private readonly aiService: AiService,
    private readonly eventsService: EventsService,
  ) {}

  /**
   * Triggers the initial 7-day email backfill for onboarding.
   */
  async triggerBackfill(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    if (user.lastBackfillAt) {
      return {
        alreadyDone: true,
        message: 'Initial 7-day backfill has already been completed.',
        lastBackfillAt: user.lastBackfillAt,
      };
    }

    const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    const windowEnd = new Date();

    const scanLog = await this.prisma.scanLog.create({
      data: {
        userId,
        status: ScanStatus.RUNNING,
        windowStart,
        windowEnd,
        emailsScanned: 0,
        eventsDetected: 0,
      },
    });

    // Execute the scan asynchronously
    this.runScanPipeline(userId, scanLog.id, windowStart, windowEnd, user.timezone).catch(
      (err) => {
        this.logger.error(
          `Scan execution failed for user ${userId}: ${err.message}`,
          err.stack,
        );
      },
    );

    return {
      success: true,
      scanLogId: scanLog.id,
      message: 'Backfill scan initiated.',
    };
  }

  /**
   * Core scan pipeline: fetch -> heuristic filter -> Gemini classification -> idempotent event upsert
   */
  async runScanPipeline(
    userId: string,
    scanLogId: string,
    windowStart: Date,
    windowEnd: Date,
    userTimezone: string = 'UTC',
  ) {
    try {
      this.logger.log(
        `Starting email scan for user ${userId} [${windowStart.toISOString()} -> ${windowEnd.toISOString()}]`,
      );

      // 1. Fetch emails from Gmail
      const emails = await this.gmailService.fetchEmails(userId, {
        since: windowStart,
        until: windowEnd,
      });

      // 2. Heuristic filtering (drop newsletters & marketing blasts)
      const candidates = emails.filter((email) => {
        const res = filterEmailHeuristically(email);
        return res.shouldScan;
      });

      this.logger.log(
        `Fetched ${emails.length} emails; ${candidates.length} candidates passed heuristic filtering.`,
      );

      let eventsCount = 0;

      // 3. AI classification via Gemini 2.0 Flash
      for (const candidate of candidates) {
        const classified = await this.aiService.classifyEmail(
          candidate,
          userTimezone,
        );

        if (classified) {
          await this.eventsService.createDetectedEvent(
            userId,
            candidate,
            classified,
          );
          eventsCount++;

          // Periodically update scan log progress
          await this.prisma.scanLog.update({
            where: { id: scanLogId },
            data: {
              emailsScanned: emails.length,
              eventsDetected: eventsCount,
            },
          });
        }
      }

      // 4. Mark scan done & update User backfill timestamp
      await this.prisma.scanLog.update({
        where: { id: scanLogId },
        data: {
          status: ScanStatus.DONE,
          emailsScanned: emails.length,
          eventsDetected: eventsCount,
          completedAt: new Date(),
        },
      });

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          gmailConnected: true,
          lastBackfillAt: new Date(),
        },
      });

      this.logger.log(
        `Scan completed successfully for user ${userId}. Found ${eventsCount} events out of ${emails.length} emails.`,
      );
    } catch (err: any) {
      this.logger.error(`Scan failed: ${err.message}`, err.stack);
      await this.prisma.scanLog.update({
        where: { id: scanLogId },
        data: {
          status: ScanStatus.FAILED,
          errorMessage: err.message,
          completedAt: new Date(),
        },
      });
    }
  }

  /**
   * Returns the most recent ScanLog for real-time progress polling.
   */
  async getLatestScan(userId: string) {
    return this.prisma.scanLog.findFirst({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    });
  }
}
