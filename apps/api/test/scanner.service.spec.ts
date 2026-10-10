import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScannerService } from '../src/modules/scanner/scanner.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { GmailService } from '../src/modules/gmail/gmail.service.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import { EventsService } from '../src/modules/events/events.service.js';
import { ScanStatus } from '@prisma/client';

describe('ScannerService', () => {
  let service: ScannerService;
  let prismaMock: any;
  let gmailMock: any;
  let aiMock: any;
  let eventsMock: any;

  const userId = 'user-a-uuid';

  const candidateEmail = {
    id: 'msg-1',
    threadId: 'thread-1',
    subject: 'Technical assessment due Friday',
    from: 'recruiter@acme.com',
    date: new Date(),
    snippet: 'Please complete the assessment before',
    gmailUrl: 'https://mail.google.com/mail/u/0/#inbox/msg-1',
  };

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ notificationTime: '07:00' }),
        findMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      scanLog: {
        create: vi.fn().mockResolvedValue({ id: 'scan-1' }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    gmailMock = { fetchEmails: vi.fn() };
    aiMock = { classifyEmail: vi.fn() };
    eventsMock = { createDetectedEvent: vi.fn().mockResolvedValue({}) };

    service = new ScannerService(
      prismaMock as PrismaService,
      gmailMock as unknown as GmailService,
      aiMock as unknown as AiService,
      eventsMock as unknown as EventsService,
    );
  });

  it('arms the nightly scan (nextScanAt) and advances the cursor when the pipeline completes', async () => {
    gmailMock.fetchEmails.mockResolvedValue([candidateEmail]);
    aiMock.classifyEmail.mockResolvedValue({ title: 'Technical assessment' });
    prismaMock.user.findUnique.mockResolvedValue({ notificationTime: '08:00' });

    const windowEnd = new Date();
    await service.runScanPipeline(
      userId,
      'scan-1',
      new Date(Date.now() - 7 * 24 * 3600 * 1000),
      windowEnd,
      'UTC',
    );

    const userUpdate = prismaMock.user.update.mock.calls.find(
      ([args]: any[]) => args.where.id === userId,
    )?.[0];

    expect(userUpdate.data.gmailConnected).toBe(true);
    expect(userUpdate.data.nextScanAt).toBeInstanceOf(Date);
    expect(userUpdate.data.nextScanAt.getTime()).toBeGreaterThan(Date.now());
    expect(userUpdate.data.nextNotifyAt).toBeInstanceOf(Date);
    expect(userUpdate.data.nextNotifyAt.getTime()).toBeGreaterThan(Date.now());
    expect(userUpdate.data.lastScannedAt).toEqual(windowEnd);
  });

  it('skips a poison email instead of failing the whole scan', async () => {
    const poison = { ...candidateEmail, id: 'msg-poison' };
    gmailMock.fetchEmails.mockResolvedValue([poison, candidateEmail]);
    aiMock.classifyEmail
      .mockRejectedValueOnce(new Error('Gemini 429 rate limited'))
      .mockResolvedValueOnce({ title: 'Technical assessment' });

    await service.runScanPipeline(
      userId,
      'scan-1',
      new Date(Date.now() - 24 * 3600 * 1000),
      new Date(),
      'UTC',
    );

    expect(aiMock.classifyEmail).toHaveBeenCalledTimes(2);
    expect(eventsMock.createDetectedEvent).toHaveBeenCalledTimes(1);
    const finalUpdate = prismaMock.scanLog.update.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data.status).toBe(ScanStatus.DONE);
    // cursor must still advance: the failing email is skipped, not fatal
    expect(prismaMock.user.update).toHaveBeenCalled();
  });

  it('does not send heuristic-blocked emails to the AI', async () => {
    gmailMock.fetchEmails.mockResolvedValue([
      { ...candidateEmail, from: 'promo@mailchimp.com', subject: '50% off sale' },
    ]);

    await service.runScanPipeline(
      userId,
      'scan-1',
      new Date(Date.now() - 24 * 3600 * 1000),
      new Date(),
      'UTC',
    );

    expect(aiMock.classifyEmail).not.toHaveBeenCalled();
    const finalUpdate = prismaMock.scanLog.update.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data.status).toBe(ScanStatus.DONE);
    expect(finalUpdate.data.eventsDetected).toBe(0);
  });

  it('does not advance the cursor when the scan fails, so the next run re-covers the gap', async () => {
    gmailMock.fetchEmails.mockRejectedValue(new Error('Gmail API unreachable'));

    await service.runScanPipeline(
      userId,
      'scan-1',
      new Date(Date.now() - 24 * 3600 * 1000),
      new Date(),
      'UTC',
    );

    expect(prismaMock.user.update).not.toHaveBeenCalled();
    const finalUpdate = prismaMock.scanLog.update.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data.status).toBe(ScanStatus.FAILED);
  });

  it('triggerBackfill skips users whose backfill already ran', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: userId,
      timezone: 'UTC',
      lastBackfillAt: new Date(),
    });

    const result = await service.triggerBackfill(userId);

    expect(result).toMatchObject({ alreadyDone: true });
    expect(gmailMock.fetchEmails).not.toHaveBeenCalled();
  });
});
