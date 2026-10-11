import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NightlyScanOrchestrator } from '../src/modules/scheduler/nightly-scan.orchestrator.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ScannerService } from '../src/modules/scanner/scanner.service.js';

describe('NightlyScanOrchestrator', () => {
  let orchestrator: NightlyScanOrchestrator;
  let prismaMock: any;
  let scannerMock: any;

  const baseUser = {
    id: 'user-a-uuid',
    timezone: 'UTC',
    gmailConnected: true,
    nextScanAt: new Date(Date.now() - 1000),
    lastScannedAt: null,
    lastBackfillAt: null,
  };

  beforeEach(() => {
    prismaMock = {
      user: {
        findMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
      scanLog: {
        create: vi.fn().mockResolvedValue({ id: 'scan-1' }),
      },
    };
    scannerMock = { runScanPipeline: vi.fn().mockResolvedValue(undefined) };
    orchestrator = new NightlyScanOrchestrator(
      prismaMock as PrismaService,
      scannerMock as unknown as ScannerService,
    );
  });

  const scanWindowOf = async () => {
    await orchestrator.dispatchDueNightlyScans();
    const call = scannerMock.runScanPipeline.mock.calls.at(-1);
    return { windowStart: call[2] as Date, windowEnd: call[3] as Date };
  };

  it('resumes the scan window from lastScannedAt, not a fixed 24h lookback', async () => {
    const cursor = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 days ago
    prismaMock.user.findMany.mockResolvedValue([
      { ...baseUser, lastScannedAt: cursor },
    ]);

    const { windowStart } = await scanWindowOf();

    expect(windowStart.getTime()).toBe(cursor.getTime() - 60 * 1000);
  });

  it('falls back to lastBackfillAt when no scan cursor exists yet', async () => {
    const backfilledAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    prismaMock.user.findMany.mockResolvedValue([
      { ...baseUser, lastBackfillAt: backfilledAt },
    ]);

    const { windowStart } = await scanWindowOf();

    expect(windowStart.getTime()).toBe(backfilledAt.getTime() - 60 * 1000);
  });

  it('uses the legacy 24h window when the user has neither cursor nor backfill', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ ...baseUser }]);

    const { windowStart, windowEnd } = await scanWindowOf();

    expect(windowEnd.getTime() - windowStart.getTime()).toBeCloseTo(
      24 * 60 * 60 * 1000,
      -2,
    );
  });

  it('bounds a long-downtime catch-up to a 3-day chunk instead of one marathon scan', async () => {
    const cursor = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    prismaMock.user.findMany.mockResolvedValue([
      { ...baseUser, lastScannedAt: cursor },
    ]);

    const { windowStart, windowEnd } = await scanWindowOf();

    const threeDays = 3 * 24 * 60 * 60 * 1000;
    expect(windowStart.getTime()).toBe(cursor.getTime() - 60 * 1000);
    expect(windowEnd.getTime()).toBe(windowStart.getTime() + threeDays);
    expect(windowEnd.getTime()).toBeLessThan(Date.now());
  });

  it('advances nextScanAt before launching the scan to prevent double-picking', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ ...baseUser }]);

    await orchestrator.dispatchDueNightlyScans();

    const advance = prismaMock.user.update.mock.calls[0]?.[0];
    expect(advance.data.nextScanAt.getTime()).toBeGreaterThan(Date.now());
    expect(scannerMock.runScanPipeline).toHaveBeenCalledTimes(1);
  });
});
