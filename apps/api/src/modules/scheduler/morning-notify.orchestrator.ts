import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { getNextScheduledTime } from '../../common/timezone.util.js';
import { EventStatus, ScanStatus } from '@prisma/client';

@Injectable()
export class MorningNotifyOrchestrator {
  private readonly logger = new Logger(MorningNotifyOrchestrator.name);
  private isTicking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchDueMorningNotifications() {
    if (this.isTicking) return;
    this.isTicking = true;

    try {
      const now = new Date();

      const dueUsers = await this.prisma.user.findMany({
        where: {
          nextNotifyAt: {
            lte: now,
          },
        },
      });

      if (dueUsers.length === 0) {
        return;
      }

      this.logger.log(`Found ${dueUsers.length} user(s) due for morning notifications`);

      for (const user of dueUsers) {
        // A catch-up scan dispatched after downtime can start in the same tick
        // that this digest comes due; sending now would read 0 pending events
        // and burn the slot. Defer while such a scan is in flight — or is due
        // but not yet picked up, since tick order is not guaranteed — capped by
        // a grace window so a hung scan cannot silence the digest forever.
        const activeScan = await this.prisma.scanLog.findFirst({
          where: { userId: user.id, status: ScanStatus.RUNNING },
          orderBy: { startedAt: 'desc' },
        });
        const GRACE_MS = 30 * 60 * 1000;
        const scanInFlight =
          (user.gmailConnected && user.nextScanAt && user.nextScanAt <= now) ||
          (activeScan !== null &&
            now.getTime() - activeScan.startedAt.getTime() < GRACE_MS);
        if (scanInFlight) {
          this.logger.log(
            `Deferring morning digest for ${user.email}: scan in flight or due`,
          );
          continue;
        }

        // Advance nextNotifyAt immediately to prevent re-picking
        const nextTime = getNextScheduledTime(
          user.notificationTime,
          user.timezone,
          now,
        );

        await this.prisma.user.update({
          where: { id: user.id },
          data: { nextNotifyAt: nextTime },
        });

        // Fetch user's pending events
        const pendingEvents = await this.prisma.detectedEvent.findMany({
          where: {
            userId: user.id,
            status: EventStatus.PENDING,
          },
          orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
        });

        if (pendingEvents.length > 0) {
          await this.notificationsService.sendMorningSummary(user, pendingEvents);
        } else {
          this.logger.log(`Skipping notification for ${user.email}: 0 pending events.`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error in morning notification tick: ${err.message}`);
    } finally {
      this.isTicking = false;
    }
  }
}
