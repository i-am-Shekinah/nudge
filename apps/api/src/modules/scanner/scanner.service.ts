import {
  Injectable,
  Logger,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { GmailService } from '../gmail/gmail.service.js';
import { filterEmailHeuristically } from '../gmail/email-filter.util.js';
import { AiService, isQuotaExhaustedError } from '../ai/ai.service.js';
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
      const candidates = emails
        .filter((email) => {
          const res = filterEmailHeuristically(email);
          return res.shouldScan;
        })
        // Oldest first: if a daily AI quota aborts the scan mid-way, the
        // cursor can honestly advance to "everything older than here was
        // classified" and tomorrow's scan resumes instead of repeating.
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      this.logger.log(
        `Fetched ${emails.length} emails; ${candidates.length} candidates passed heuristic filtering.`,
      );

      let eventsCount = 0;
      let processed = 0;
      let classificationErrors = 0;
      let lastClassifiedAt: Date | null = null;
      const PROGRESS_EVERY = 10;

      // 3. AI classification via Gemini, in quota-efficient batches
      const batchSize = this.aiService.batchSize;
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        try {
          // Transient body excerpts so deadlines buried past the snippet are
          // visible to the classifier; never stored, and a failed fetch
          // degrades that email to snippet-only rather than dropping it.
          const emailsWithBodies = await Promise.all(
            batch.map(async (candidate) => {
              try {
                const body = await this.gmailService.fetchEmailContent(
                  userId,
                  candidate.id,
                );
                return { ...candidate, body };
              } catch (err: any) {
                this.logger.warn(
                  `Body fetch failed for email ${candidate.id}, classifying on snippet only: ${err.message}`,
                );
                return candidate;
              }
            }),
          );

          const results = await this.aiService.classifyEmailBatch(
            emailsWithBodies,
            userTimezone,
          );

          for (const email of emailsWithBodies) {
            const classified = results.get(email.id);
            if (classified) {
              await this.eventsService.createDetectedEvent(
                userId,
                email,
                classified,
              );
              eventsCount++;
            }
          }
          lastClassifiedAt = batch[batch.length - 1].date;
        } catch (err: any) {
          // Quota exhaustion will not lift mid-scan: abort, advance the
          // cursor to the last fully-classified batch (never past this one),
          // and fail the scan so the rest resumes tomorrow instead of
          // re-spending the daily quota on already-processed mail.
          if (isQuotaExhaustedError(err)) {
            if (
              lastClassifiedAt &&
              lastClassifiedAt.getTime() > windowStart.getTime()
            ) {
              await this.prisma.user.update({
                where: { id: userId },
                data: { lastScannedAt: lastClassifiedAt },
              });
            }
            throw err;
          }
          // A broken batch is skipped whole; the systematic-failure check
          // below still turns an all-failing scan into an honest FAILED.
          classificationErrors += batch.length;
          this.logger.warn(
            `Classification failed for a batch of ${batch.length} emails, skipping: ${err.message}`,
          );
        }

        processed += batch.length;
        const crossedMilestone =
          Math.floor(processed / PROGRESS_EVERY) >
          Math.floor((processed - batch.length) / PROGRESS_EVERY);
        if (crossedMilestone || processed === candidates.length) {
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
   * On-demand scan from the dashboard, gated to one scan per hour. The gate
   * counts ANY recent scan (nightly included): fresh results are fresh
   * results, and re-scanning on top of them only burns quota.
   */
  async triggerManualScan(userId: string) {
    const MANUAL_SCAN_INTERVAL_MS = 60 * 60 * 1000;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const lastScan = await this.prisma.scanLog.findFirst({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    });
    if (lastScan) {
      const elapsed = Date.now() - lastScan.startedAt.getTime();
      if (elapsed < MANUAL_SCAN_INTERVAL_MS) {
        const waitMinutes = Math.ceil(
          (MANUAL_SCAN_INTERVAL_MS - elapsed) / (60 * 1000),
        );
        throw new HttpException(
          `We just finished a scan. The next one is available in ${waitMinutes} ${waitMinutes === 1 ? 'minute' : 'minutes'} — or no need to wait at all: Nudge scans your inbox automatically at midnight.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const cursor = user.lastScannedAt ?? user.lastBackfillAt;
    const windowStart = cursor
      ? new Date(cursor.getTime() - 60 * 1000)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Same bound as the nightly orchestrator: a very old cursor chains
    // follow-up scans instead of flooding one giant window.
    const MAX_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
    const windowEnd = new Date(
      Math.min(Date.now(), windowStart.getTime() + MAX_WINDOW_MS),
    );

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

    this.runScanPipeline(userId, scanLog.id, windowStart, windowEnd, user.timezone).catch(
      (err) => {
        this.logger.error(
          `Manual scan failed for user ${userId}: ${err.message}`,
          err.stack,
        );
      },
    );

    return {
      started: true,
      scanLogId: scanLog.id,
      message: 'Scan started. New events will appear here when it finishes.',
    };
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
