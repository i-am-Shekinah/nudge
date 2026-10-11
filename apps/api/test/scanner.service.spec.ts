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
    gmailMock = {
      fetchEmails: vi.fn(),
      fetchEmailContent: vi.fn().mockResolvedValue('body excerpt for classification'),
    };
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

  it('fails the scan and holds the cursor when classification errors on every candidate', async () => {
    // A retired model / dead API key is a systematic outage, not poison emails:
    // "0 events" must not be recorded as a success over an unprocessed window.
    gmailMock.fetchEmails.mockResolvedValue([
      candidateEmail,
      { ...candidateEmail, id: 'msg-2' },
    ]);
    aiMock.classifyEmail.mockRejectedValue(
      new Error('model gemini-2.0-flash is no longer available'),
    );

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
    expect(finalUpdate.data.errorMessage).toMatch(/all 2 candidates/i);
  });

  it('classifies candidates with a transient body excerpt so buried deadlines are visible', async () => {
    gmailMock.fetchEmails.mockResolvedValue([candidateEmail]);
    gmailMock.fetchEmailContent.mockResolvedValue('Deadline: Monday, 12 October 2026');
    aiMock.classifyEmail.mockResolvedValue(null);

    await service.runScanPipeline(
      userId,
      'scan-1',
      new Date(Date.now() - 24 * 3600 * 1000),
      new Date(),
      'UTC',
    );

    const passed = aiMock.classifyEmail.mock.calls[0][0];
    expect(passed.body).toBe('Deadline: Monday, 12 October 2026');
  });

  it('degrades to snippet-only classification when the body fetch fails', async () => {
    gmailMock.fetchEmails.mockResolvedValue([candidateEmail]);
    gmailMock.fetchEmailContent.mockRejectedValue(new Error('429 rate limited'));
    aiMock.classifyEmail.mockResolvedValue(null);

    await service.runScanPipeline(
      userId,
      'scan-1',
      new Date(Date.now() - 24 * 3600 * 1000),
      new Date(),
      'UTC',
    );

    expect(aiMock.classifyEmail).toHaveBeenCalledTimes(1);
    expect(aiMock.classifyEmail.mock.calls[0][0].body).toBeUndefined();
    const finalUpdate = prismaMock.scanLog.update.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data.status).toBe(ScanStatus.DONE);
  });

  it('chains an immediate follow-up scan when a chunk leaves the cursor behind', async () => {
    gmailMock.fetchEmails.mockResolvedValue([candidateEmail]);
    aiMock.classifyEmail.mockResolvedValue(null);

    const staleWindowEnd = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h behind
    await service.runScanPipeline(
      userId,
      'scan-1',
      new Date(staleWindowEnd.getTime() - 3 * 24 * 3600 * 1000),
      staleWindowEnd,
      'UTC',
    );

    const userUpdate = prismaMock.user.update.mock.calls.find(
      ([args]: any[]) => args.where.id === userId,
    )?.[0];

    // next scan in ~60s (catch-up mode), not tomorrow's midnight
    const delay = userUpdate.data.nextScanAt.getTime() - Date.now();
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThan(5 * 60 * 1000);
  });

  it('reports incremental progress so the onboarding counter is honest', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...candidateEmail,
      id: `msg-${i}`,
    }));
    gmailMock.fetchEmails.mockResolvedValue(many);
    aiMock.classifyEmail.mockResolvedValue(null);

    await service.runScanPipeline(
      userId,
      'scan-1',
      new Date(Date.now() - 24 * 3600 * 1000),
      new Date(),
      'UTC',
    );

    const progressWrites = prismaMock.scanLog.update.mock.calls
      .map(([args]: any[]) => args.data.emailsScanned)
      .filter((n: number) => n === 10 || n === 20);
    expect(progressWrites).toEqual([10, 20]);
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
