import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MorningNotifyOrchestrator } from '../src/modules/scheduler/morning-notify.orchestrator.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { NotificationsService } from '../src/modules/notifications/notifications.service.js';

describe('MorningNotifyOrchestrator', () => {
  let orchestrator: MorningNotifyOrchestrator;
  let prismaMock: any;
  let notificationsMock: any;

  const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

  const baseUser = {
    id: 'user-a-uuid',
    email: 'a@example.com',
    timezone: 'UTC',
    notificationTime: '07:00',
    gmailConnected: true,
    nextNotifyAt: minutesAgo(5),
    nextScanAt: null,
  };

  beforeEach(() => {
    prismaMock = {
      user: {
        findMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      scanLog: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      detectedEvent: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'event-1', userId: 'user-a-uuid', status: 'PENDING' },
        ]),
      },
    };
    notificationsMock = { sendMorningSummary: vi.fn().mockResolvedValue(undefined) };
    orchestrator = new MorningNotifyOrchestrator(
      prismaMock as PrismaService,
      notificationsMock as unknown as NotificationsService,
    );
  });

  it('sends the digest and re-arms nextNotifyAt when no scan is in flight', async () => {
    prismaMock.user.findMany.mockResolvedValue([baseUser]);

    await orchestrator.dispatchDueMorningNotifications();

    expect(notificationsMock.sendMorningSummary).toHaveBeenCalledTimes(1);
    const bump = prismaMock.user.update.mock.calls[0][0];
    expect(bump.data.nextNotifyAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('defers the digest while a catch-up scan is running, without burning the slot', async () => {
    prismaMock.user.findMany.mockResolvedValue([baseUser]);
    prismaMock.scanLog.findFirst.mockResolvedValue({
      id: 'scan-1',
      status: 'RUNNING',
      startedAt: minutesAgo(2),
    });

    await orchestrator.dispatchDueMorningNotifications();

    expect(notificationsMock.sendMorningSummary).not.toHaveBeenCalled();
    // No bump means the user stays due and is retried on the next tick.
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('defers when a nightly scan is due but not yet picked up, even with no RUNNING log', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { ...baseUser, nextScanAt: minutesAgo(1) },
    ]);

    await orchestrator.dispatchDueMorningNotifications();

    expect(notificationsMock.sendMorningSummary).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('gives up deferring once the running scan is older than the grace window', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ ...baseUser, nextScanAt: null }]);
    prismaMock.scanLog.findFirst.mockResolvedValue({
      id: 'scan-hung',
      status: 'RUNNING',
      startedAt: minutesAgo(31),
    });

    await orchestrator.dispatchDueMorningNotifications();

    expect(notificationsMock.sendMorningSummary).toHaveBeenCalledTimes(1);
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
  });

  it('still re-arms a deferred slot when the scan finds no pending events', async () => {
    prismaMock.user.findMany.mockResolvedValue([baseUser]);
    prismaMock.detectedEvent.findMany.mockResolvedValue([]);

    await orchestrator.dispatchDueMorningNotifications();

    expect(notificationsMock.sendMorningSummary).not.toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1);
  });
});
