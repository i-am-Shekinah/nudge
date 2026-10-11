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
import { getNextMidnight, getNextScheduledTime } from '../../common/timezone.util.js';
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
      let processed = 0;
      let classificationErrors = 0;
      const PROGRESS_EVERY = 10;

      // 3. AI classification via Gemini
      for (const candidate of candidates) {
        try {
          // Transient body excerpt so deadlines buried past the snippet are
          // visible to the classifier; never stored, and failure degrades to
          // snippet-only rather than dropping the email.
          let emailWithContext = candidate;
          try {
            const body = await this.gmailService.fetchEmailContent(
              userId,
              candidate.id,
            );
            emailWithContext = { ...candidate, body };
          } catch (err: any) {
            this.logger.warn(
              `Body fetch failed for email ${candidate.id}, classifying on snippet only: ${err.message}`,
            );
          }

          const classified = await this.aiService.classifyEmail(
            emailWithContext,
            userTimezone,
          );

          if (classified) {
            await this.eventsService.createDetectedEvent(
              userId,
              candidate,
              classified,
            );
            eventsCount++;
          }
        } catch (err: any) {
          // One poison email (rate limit, parser crash) must not fail the
          // whole scan: that would stall the cursor and re-crash nightly.
          classificationErrors++;
          this.logger.warn(
            `Classification failed for email ${candidate.id}, skipping: ${err.message}`,
          );
        }

        processed++;
        if (processed % PROGRESS_EVERY === 0) {
          await this.prisma.scanLog.update({
            where: { id: scanLogId },
            data: {
              emailsScanned: processed,
              eventsDetected: eventsCount,
            },
          });
        }
      }

      // Partial failures are poison emails; a 100% failure rate is a
      // systematic AI outage (retired model, bad key) — treat the scan as
      // failed so the cursor holds and the window is re-scanned later.
      if (candidates.length > 0 && classificationErrors === candidates.length) {
        throw new Error(
          `AI classification failed for all ${candidates.length} candidates — holding scan cursor`,
        );
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

      const scanUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { notificationTime: true },
      });

      // If this scan was only a bounded chunk of a long catch-up, chain the
      // next one in 60s instead of waiting a full day for the next midnight.
      const completedAt = new Date();
      const stillBehind =
        completedAt.getTime() - windowEnd.getTime() > 10 * 60 * 1000;

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          gmailConnected: true,
          lastBackfillAt: new Date(),
          // Arm the nightly scan; without this a user is never due (nextScanAt stays null)
          nextScanAt: stillBehind
            ? new Date(completedAt.getTime() + 60 * 1000)
            : getNextMidnight(userTimezone, completedAt),
          // Same arming for the morning digest (nextNotifyAt is otherwise only
          // set when the user edits settings)
          nextNotifyAt: getNextScheduledTime(
            scanUser?.notificationTime ?? '07:00',
            userTimezone,
            completedAt,
          ),
          // Advance the scan cursor only on success; failed scans leave the
          // gap for the next run to cover (event upserts dedupe any overlap)
          lastScannedAt: windowEnd,
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
