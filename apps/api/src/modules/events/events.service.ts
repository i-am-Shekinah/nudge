import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailDto } from '../gmail/gmail.types.js';
import { AiClassifiedEvent } from '../ai/ai.schema.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { EventStatus, Importance } from '@prisma/client';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarService: CalendarService,
  ) {}

  /**
   * Idempotently saves a classified event as a DetectedEvent.
   */
  async createDetectedEvent(
    userId: string,
    email: EmailDto,
    classified: AiClassifiedEvent,
  ) {
    const eventDate = classified.start_at
      ? new Date(classified.start_at)
      : classified.deadline
        ? new Date(classified.deadline)
        : new Date();

    const autoDeleteAt = new Date(eventDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const importance =
      classified.importance === 'HIGH'
        ? Importance.HIGH
        : classified.importance === 'LOW'
          ? Importance.LOW
          : Importance.MEDIUM;

    const detected = await this.prisma.detectedEvent.upsert({
      where: {
        userId_gmailMessageId: {
          userId,
          gmailMessageId: email.id,
        },
      },
      create: {
        userId,
        gmailMessageId: email.id,
        emailSubject: email.subject,
        emailSender: email.from,
        gmailLink: email.gmailUrl,
        title: classified.title || email.subject,
        summary: classified.summary || email.snippet,
        eventType: classified.event_type || 'event',
        startAt: classified.start_at ? new Date(classified.start_at) : null,
        endAt: classified.end_at ? new Date(classified.end_at) : null,
        deadline: classified.deadline ? new Date(classified.deadline) : null,
        timezone: classified.timezone || 'UTC',
        importance,
        confidence: classified.confidence,
        autoDeleteAt,
        status: EventStatus.PENDING,
      },
      update: {}, // Idempotent: preserve existing event
    });

    return detected;
  }

  /**
   * Lists events filtered by status and scoped strictly to the requesting user.
   */
  async listEvents(userId: string, statusQuery?: string) {
    let whereStatus: any = { status: EventStatus.PENDING };

    if (statusQuery === 'IGNORED') {
      whereStatus = { status: EventStatus.IGNORED };
    } else if (statusQuery === 'HISTORY') {
      whereStatus = {
        status: {
          in: [EventStatus.APPROVED, EventStatus.ACTIVE, EventStatus.COMPLETED, EventStatus.EXPIRED],
        },
      };
    } else if (statusQuery === 'ALL') {
      whereStatus = {};
    }

    return this.prisma.detectedEvent.findMany({
      where: {
        userId,
        ...whereStatus,
      },
      orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Approves an event: moves state to APPROVED and creates Google Calendar entry.
   */
  async approveEvent(userId: string, eventId: string) {
    const event = await this.prisma.detectedEvent.findFirst({
      where: { id: eventId, userId },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found for this user`);
    }

    // Update status to APPROVED
    await this.prisma.detectedEvent.update({
      where: { id: eventId },
      data: { status: EventStatus.APPROVED },
    });

    // Create Calendar event (or queue job)
    try {
      await this.calendarService.createCalendarEvent(userId, eventId);
    } catch (err: any) {
      this.logger.warn(
        `Calendar event creation scheduled or deferred for event ${eventId}: ${err.message}`,
      );
    }

    return this.prisma.detectedEvent.findUnique({ where: { id: eventId } });
  }

  /**
   * Ignores/dismisses an event: moves state to IGNORED.
   */
  async ignoreEvent(userId: string, eventId: string) {
    const event = await this.prisma.detectedEvent.findFirst({
      where: { id: eventId, userId },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found for this user`);
    }

    return this.prisma.detectedEvent.update({
      where: { id: eventId },
      data: { status: EventStatus.IGNORED },
    });
  }

  /**
   * Undoes an approval: deletes the Google Calendar event and returns event to PENDING.
   */
  async undoEvent(userId: string, eventId: string) {
    const event = await this.prisma.detectedEvent.findFirst({
      where: { id: eventId, userId },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found for this user`);
    }

    // Delete Calendar event if created
    try {
      await this.calendarService.deleteCalendarEvent(userId, eventId);
    } catch (err: any) {
      this.logger.warn(`Calendar delete notice during undo: ${err.message}`);
    }

    return this.prisma.detectedEvent.update({
      where: { id: eventId },
      data: { status: EventStatus.PENDING },
    });
  }

  /**
   * Permanently deletes an event record.
   */
  async deleteEvent(userId: string, eventId: string) {
    const event = await this.prisma.detectedEvent.findFirst({
      where: { id: eventId, userId },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} not found for this user`);
    }

    if (event.googleCalendarEventId) {
      await this.calendarService.deleteCalendarEvent(userId, eventId);
    }

    await this.prisma.detectedEvent.delete({
      where: { id: eventId },
    });

    return { success: true, message: `Event ${eventId} deleted.` };
  }
}
