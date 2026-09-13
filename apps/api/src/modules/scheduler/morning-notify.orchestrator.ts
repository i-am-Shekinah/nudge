import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { getNextScheduledTime } from '../../common/timezone.util.js';
import { EventStatus } from '@prisma/client';

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
