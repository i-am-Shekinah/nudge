import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventsService } from '../src/modules/events/events.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { CalendarService } from '../src/modules/calendar/calendar.service.js';
import { EventStatus } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

describe('EventsService', () => {
  let service: EventsService;
  let prismaMock: any;
  let calendarMock: any;

  const userA = 'user-a-uuid';
  const userB = 'user-b-uuid';
  const sampleEvent = {
    id: 'event-123',
    userId: userA,
    title: 'Flight UA 428',
    status: EventStatus.PENDING,
    gmailMessageId: 'msg-abc',
    googleCalendarEventId: null,
  };

  beforeEach(() => {
    prismaMock = {
      detectedEvent: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        upsert: vi.fn(),
      },
    };

    calendarMock = {
      createCalendarEvent: vi.fn().mockResolvedValue('cal-event-id-123'),
      deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
    };

    service = new EventsService(
      prismaMock as PrismaService,
      calendarMock as CalendarService,
    );
  });

  it('should approve a pending event and trigger Google Calendar creation', async () => {
    prismaMock.detectedEvent.findFirst.mockResolvedValue(sampleEvent);
    prismaMock.detectedEvent.update.mockResolvedValue({
      ...sampleEvent,
      status: EventStatus.APPROVED,
    });
    prismaMock.detectedEvent.findUnique.mockResolvedValue({
      ...sampleEvent,
      status: EventStatus.APPROVED,
    });

    const result = await service.approveEvent(userA, 'event-123');
    expect(result?.status).toBe(EventStatus.APPROVED);
    expect(calendarMock.createCalendarEvent).toHaveBeenCalledWith(userA, 'event-123');
  });

  it('should prevent User B from approving User A event (user isolation)', async () => {
    prismaMock.detectedEvent.findFirst.mockResolvedValue(null);

    await expect(service.approveEvent(userB, 'event-123')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should delete Google Calendar event and return Nudge event to PENDING on undo', async () => {
    const approvedEvent = {
      ...sampleEvent,
      status: EventStatus.APPROVED,
      googleCalendarEventId: 'cal-event-id-123',
    };
    prismaMock.detectedEvent.findFirst.mockResolvedValue(approvedEvent);
    prismaMock.detectedEvent.update.mockResolvedValue({
      ...approvedEvent,
      status: EventStatus.PENDING,
      googleCalendarEventId: null,
    });

    const result = await service.undoEvent(userA, 'event-123');
    expect(result.status).toBe(EventStatus.PENDING);
    expect(calendarMock.deleteCalendarEvent).toHaveBeenCalledWith(userA, 'event-123');
  });

  it('should ignore/dismiss an event', async () => {
    prismaMock.detectedEvent.findFirst.mockResolvedValue(sampleEvent);
    prismaMock.detectedEvent.update.mockResolvedValue({
      ...sampleEvent,
      status: EventStatus.IGNORED,
    });

    const result = await service.ignoreEvent(userA, 'event-123');
    expect(result.status).toBe(EventStatus.IGNORED);
  });
});
