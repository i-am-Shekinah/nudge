import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EventStatus } from '@prisma/client';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async getCalendarClient(userId: string) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    const tokens = await this.authService.getUserTokens(userId);

    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    return google.calendar({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Creates an event in Google Calendar with user-configured reminders.
   * Includes duplicate protection (skips if googleCalendarEventId already exists).
   */
  async createCalendarEvent(userId: string, eventId: string): Promise<string> {
    const event = await this.prisma.detectedEvent.findFirst({
      where: { id: eventId, userId },
      include: { user: true },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found for user ${userId}`);
    }

    // 1. Duplicate protection
    if (event.googleCalendarEventId) {
      this.logger.log(
        `Event ${eventId} already has Google Calendar ID (${event.googleCalendarEventId}). Skipping duplicate creation.`,
      );
      return event.googleCalendarEventId;
    }

    try {
      const userReminders = event.user?.customReminders?.length
        ? event.user.customReminders
        : [4320, 1440, 60, 30, 5]; // Default 3d, 1d, 1h, 30m, 5m

      const reminderOverrides = userReminders.map((minutes) => ({
        method: 'popup',
        minutes,
      }));

      const startAt = event.startAt || event.deadline || new Date();
      const endAt =
        event.endAt ||
        new Date(startAt.getTime() + 60 * 60 * 1000); // 1 hour duration default

      const requestBody = {
        summary: event.title,
        description: `${event.summary}\n\nOriginal Email: ${event.emailSubject}\nView in Gmail: ${event.gmailLink}`,
        start: {
          dateTime: startAt.toISOString(),
          timeZone: event.timezone || event.user?.timezone || 'UTC',
        },
        end: {
          dateTime: endAt.toISOString(),
          timeZone: event.timezone || event.user?.timezone || 'UTC',
        },
        reminders: {
          useDefault: false,
          overrides: reminderOverrides,
        },
      };

      let calendarEventId = `mock-cal-${Date.now()}`;

      // In production with credentials, call live Google Calendar API
      const isMock =
        !this.configService.get<string>('GOOGLE_CLIENT_ID') ||
        this.configService.get<string>('GOOGLE_CLIENT_ID') === 'mock-google-client-id';

      if (!isMock) {
        const calendar = await this.getCalendarClient(userId);
        const res = await calendar.events.insert({
          calendarId: 'primary',
          requestBody,
        });
        calendarEventId = res.data.id || calendarEventId;
      }

      // Update DetectedEvent to ACTIVE with calendarEventId
      await this.prisma.detectedEvent.update({
        where: { id: eventId },
        data: {
          googleCalendarEventId: calendarEventId,
          status: EventStatus.ACTIVE,
          calendarError: null,
          calendarRetryCount: 0,
        },
      });

      this.logger.log(
        `Created Google Calendar event ${calendarEventId} for DetectedEvent ${eventId}`,
      );
      return calendarEventId;
    } catch (err: any) {
      const nextRetryCount = (event.calendarRetryCount || 0) + 1;
      const isFinalFailure = nextRetryCount >= 3;

      this.logger.error(
        `Failed to create Google Calendar event (Attempt ${nextRetryCount}/3): ${err.message}`,
      );

      await this.prisma.detectedEvent.update({
        where: { id: eventId },
        data: {
          calendarRetryCount: nextRetryCount,
          calendarError: err.message,
          status: isFinalFailure ? EventStatus.ERROR : event.status,
        },
      });

      if (isFinalFailure) {
        this.notificationsService.notifyCalendarError(userId, event).catch(() => {});
      }

      throw err;
    }
  }

  /**
   * Deletes a calendar event when an approval is undone.
   */
  async deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
    const event = await this.prisma.detectedEvent.findFirst({
      where: { id: eventId, userId },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found for user ${userId}`);
    }

    if (event.googleCalendarEventId) {
      const isMock =
        !this.configService.get<string>('GOOGLE_CLIENT_ID') ||
        this.configService.get<string>('GOOGLE_CLIENT_ID') === 'mock-google-client-id';

      if (!isMock) {
        try {
          const calendar = await this.getCalendarClient(userId);
          await calendar.events.delete({
            calendarId: 'primary',
            eventId: event.googleCalendarEventId,
          });
        } catch (err: any) {
          this.logger.warn(
            `Calendar API delete notice for ${event.googleCalendarEventId}: ${err.message}`,
          );
        }
      }
    }

    // Clear calendarEventId and restore status to PENDING
    await this.prisma.detectedEvent.update({
      where: { id: eventId },
      data: {
        googleCalendarEventId: null,
        status: EventStatus.PENDING,
        calendarError: null,
        calendarRetryCount: 0,
      },
    });

    this.logger.log(
      `Deleted calendar event and reverted DetectedEvent ${eventId} to PENDING`,
    );
  }
}
