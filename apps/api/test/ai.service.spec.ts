import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiService } from '../src/modules/ai/ai.service.js';

const generateMock = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateMock };
  },
  Type: {
    OBJECT: 'OBJECT',
    ARRAY: 'ARRAY',
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    BOOLEAN: 'BOOLEAN',
  },
}));

describe('AiService classification', () => {
  let service: AiService;

  const email = {
    id: 'msg-1',
    threadId: 't-1',
    subject: 'Software Engineering Role/Requirement',
    from: 'recruiter@brightpath.example',
    date: new Date(),
    snippet: 'Thank you for your interest...',
    gmailUrl: 'https://mail.google.com/',
    body: 'Deadline: Monday, 12 October 2026, at 2:00 PM WAT.',
  };

  const event = {
    is_time_sensitive: true,
    event_type: 'assessment',
    title: 'BrightPath technical assessment',
    start_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    confidence: 0.9,
  };

  const batchResponse = (
    items: Array<{ id: string; result?: object }>,
  ) => ({
    text: JSON.stringify({
      results: items.map(({ id, result }) => ({
        email_id: id,
        ...(result ?? { is_time_sensitive: false, confidence: 0.1 }),
      })),
    }),
  });

  beforeEach(() => {
    generateMock.mockReset();
    service = new AiService({
      get: vi.fn((key: string) =>
        key === 'GEMINI_API_KEY' ? 'test-key' : undefined,
      ),
    } as any);
    (service as any).retryDelaysMs = [1, 1];
    // Keep the shared service single-model; fallback has its own specs below.
    (service as any).fallbackModel = null;
  });

  it('classifies a single email through the wrapper', async () => {
    generateMock.mockResolvedValue(
      batchResponse([{ id: 'msg-1', result: event }]),
    );

    const result = await service.classifyEmail(email, 'UTC');

    expect(result?.title).toBe('BrightPath technical assessment');
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it('classifies a whole batch in ONE call, keyed by email_id', async () => {
    const emails = [
      { ...email, id: 'a' },
      { ...email, id: 'b' },
      { ...email, id: 'c' },
    ];
    generateMock.mockResolvedValue(
      batchResponse([
        { id: 'a', result: event },
        { id: 'c', result: event },
      ]),
    );

    const results = await service.classifyEmailBatch(emails, 'UTC');

    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(results.get('a')?.title).toBe('BrightPath technical assessment');
    expect(results.get('c')?.title).toBe('BrightPath technical assessment');
    // 'b' was dropped by the model: non-event, not a crash
    expect(results.get('b')).toBeNull();
  });

  it('retries a 503 load-shed and classifies within the same call', async () => {
    generateMock
      .mockRejectedValueOnce(
        Object.assign(new Error('This model is currently experiencing high demand'), {
          code: 503,
        }),
      )
      .mockResolvedValueOnce(batchResponse([{ id: 'msg-1', result: event }]));

    const result = await service.classifyEmail(email, 'UTC');

    expect(result?.title).toBe('BrightPath technical assessment');
    expect(generateMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry auth failures', async () => {
    generateMock.mockRejectedValue(
      Object.assign(new Error('API key not valid'), { code: 401 }),
    );

    await expect(service.classifyEmail(email, 'UTC')).rejects.toThrow(
      'API key not valid',
    );
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry daily-quota exhaustion — the wall lifts in hours, not seconds', async () => {
    generateMock.mockRejectedValue(
      Object.assign(
        new Error(
          '{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}',
        ),
        { code: 429 },
      ),
    );

    await expect(service.classifyEmail(email, 'UTC')).rejects.toThrow(
      'RESOURCE_EXHAUSTED',
    );
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the bounded retries so the scan can fail honestly', async () => {
    generateMock.mockRejectedValue(new Error('high demand'));

    await expect(service.classifyEmail(email, 'UTC')).rejects.toThrow(
      'high demand',
    );
    // 1 initial + 2 retries
    expect(generateMock).toHaveBeenCalledTimes(3);
  });

  it('production backoff rides out a 503 burst that outlasts the first retries', async () => {    // Regression: real "high demand" bursts lasted minutes, so the shipped
    // schedule must cover 3 retries (2s/15s/60s). Not overridden in beforeEach.
    vi.useFakeTimers();
    try {
      const production = new AiService({
        get: vi.fn((key: string) =>
          key === 'GEMINI_API_KEY' ? 'test-key' : undefined,
        ),
      } as any);
      const shed = () =>
        Object.assign(
          new Error('This model is currently experiencing high demand'),
          { code: 503 },
        );
      generateMock
        .mockRejectedValueOnce(shed())
        .mockRejectedValueOnce(shed())
        .mockRejectedValueOnce(shed())
        .mockResolvedValueOnce(batchResponse([{ id: 'msg-1', result: event }]));

      const promise = production.classifyEmail(email, 'UTC');
      await vi.runAllTimersAsync();

      expect((await promise)?.title).toBe('BrightPath technical assessment');
      expect(generateMock).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the secondary model when the primary keeps shedding', async () => {
    (service as any).fallbackModel = 'gemini-flash-latest';
    generateMock.mockImplementation(async ({ model }: any) => {
      if (model === 'gemini-flash-latest') {
        return batchResponse([{ id: 'msg-1', result: event }]);
      }
      throw Object.assign(
        new Error('This model is currently experiencing high demand'),
        { code: 503 },
      );
    });

    const result = await service.classifyEmail(email, 'UTC');

    expect(result?.title).toBe('BrightPath technical assessment');
    const models = generateMock.mock.calls.map(([args]: any[]) => args.model);
    // primary exhausted its whole backoff cycle first, then one fallback pass
    expect(models.slice(0, 3)).toEqual(
      Array(3).fill('gemini-3.8-flash'),
    );
    expect(models.at(-1)).toBe('gemini-flash-latest');
  });

  it('does not double-bill quota exhaustion against the fallback model', async () => {
    (service as any).fallbackModel = 'gemini-flash-latest';
    generateMock.mockRejectedValue(
      Object.assign(
        new Error(
          '{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}',
        ),
        { code: 429 },
      ),
    );

    await expect(service.classifyEmail(email, 'UTC')).rejects.toThrow(
      'RESOURCE_EXHAUSTED',
    );
    // account-level wall: one attempt, same key/model buys nothing
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(generateMock.mock.calls[0][0].model).toBe('gemini-3.8-flash');
  });

  it('sends the structured-output schema so even the lite fallback must conform', async () => {
    generateMock.mockResolvedValue(
      batchResponse([{ id: 'msg-1', result: event }]),
    );

    await service.classifyEmail(email, 'UTC');

    const config = generateMock.mock.calls[0][0].config;
    const itemProps = config.responseSchema.properties.results.items;
    // Regression: gemini-flash-lite-latest dropped is_time_sensitive from
    // every result; responseSchema makes that structurally impossible.
    expect(itemProps.properties.is_time_sensitive.type).toBe('BOOLEAN');
    expect(itemProps.required).toContain('is_time_sensitive');
  });

  it('includes the transient body excerpt in the prompt', async () => {
    generateMock.mockResolvedValue(
      batchResponse([{ id: 'msg-1', result: event }]),
    );

    await service.classifyEmail(email, 'UTC');

    const sentText = generateMock.mock.calls[0][0].contents[0].parts[0].text;
    expect(sentText).toContain('Deadline: Monday, 12 October 2026');
    expect(sentText).toContain('=== EMAIL msg-1 ===');
  });

  it('honors AI_BATCH_SIZE from config, capped at 30', () => {
    const configured = new AiService({
      get: vi.fn((key: string) =>
        key === 'GEMINI_API_KEY'
          ? 'test-key'
          : key === 'AI_BATCH_SIZE'
            ? '50'
            : undefined,
      ),
    } as any);
    expect(configured.batchSize).toBe(30);

    const defaulted = new AiService({
      get: vi.fn((key: string) => (key === 'GEMINI_API_KEY' ? 'k' : undefined)),
    } as any);
    expect(defaulted.batchSize).toBe(20);
  });
});
