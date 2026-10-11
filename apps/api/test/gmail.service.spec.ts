import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GmailService } from '../src/modules/gmail/gmail.service.js';

// googleapis is instantiated inside getAuthenticatedClient, so the OAuth2
// client is mocked at module level; __refreshImpl lets each test steer it.
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
        refreshAccessToken() {
          return (globalThis as any).__refreshImpl();
        }
      },
    },
    gmail: vi.fn(() => ({ users: { messages: {} } })),
  },
}));

describe('GmailService.fetchEmails', () => {
  let service: GmailService;
  let listMock: any;
  let getMock: any;

  const headerMsg = (id: string) => ({
    id,
    threadId: `thread-${id}`,
    payload: {
      headers: [
        { name: 'Subject', value: `Subject of ${id}` },
        { name: 'From', value: 'someone@acme.com' },
        { name: 'Date', value: 'Fri, 10 Oct 2026 12:00:00 +0000' },
      ],
    },
    snippet: 'preview text',
  });

  beforeEach(() => {
    listMock = vi.fn();
    getMock = vi.fn();

    service = new GmailService(
      { get: vi.fn().mockReturnValue('fake-client-id') } as any,
      { user: { update: vi.fn() } } as any,
      { getUserTokens: vi.fn() } as any,
    );
    vi.spyOn(service, 'getAuthenticatedClient').mockResolvedValue({
      users: { messages: { list: listMock, get: getMock } },
    } as any);

    getMock.mockImplementation(async ({ id }: any) => ({
      data: headerMsg(id),
    }));
  });

  it('walks every page via nextPageToken instead of stopping at the first', async () => {
    listMock
      .mockResolvedValueOnce({
        data: {
          messages: [{ id: 'a' }, { id: 'b' }],
          nextPageToken: 'page-2',
        },
      })
      .mockResolvedValueOnce({
        data: { messages: [{ id: 'c' }] },
      });

    const emails = await service.fetchEmails('user-1', {
      since: new Date(Date.now() - 86400000),
    });

    expect(listMock).toHaveBeenCalledTimes(2);
    expect(listMock.mock.calls[1][0].pageToken).toBe('page-2');
    expect(emails.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('requests metadata format only — never a full payload or body', async () => {
    listMock.mockResolvedValueOnce({ data: { messages: [{ id: 'a' }] } });

    await service.fetchEmails('user-1', {
      since: new Date(Date.now() - 86400000),
    });

    const args = getMock.mock.calls[0][0];
    expect(args.format).toBe('metadata');
    expect(args.metadataHeaders).toEqual(['Subject', 'From', 'Date']);
  });

  it('rejects when messages.list fails, so the scan cannot report a false success', async () => {
    (service as any).listRetryDelaysMs = [];
    listMock.mockRejectedValueOnce(
      new Error('Client network socket disconnected before secure TLS connection'),
    );

    await expect(
      service.fetchEmails('user-1', {
        since: new Date(Date.now() - 86400000),
      }),
    ).rejects.toThrow('Client network socket disconnected');
  });

  it('retries a transient messages.list failure and succeeds within the same scan', async () => {
    (service as any).listRetryDelaysMs = [1, 1];
    listMock
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce({ data: { messages: [{ id: 'a' }] } });

    const emails = await service.fetchEmails('user-1', {
      since: new Date(Date.now() - 86400000),
    });

    expect(listMock).toHaveBeenCalledTimes(2);
    expect(emails.map((e) => e.id)).toEqual(['a']);
  });

  it('gives up after the bounded retries and propagates the failure', async () => {
    (service as any).listRetryDelaysMs = [1, 1];
    listMock.mockRejectedValue(new Error('ECONNRESET'));

    await expect(
      service.fetchEmails('user-1', {
        since: new Date(Date.now() - 86400000),
      }),
    ).rejects.toThrow('ECONNRESET');

    // 1 initial attempt + 2 retries, no infinite loop
    expect(listMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry auth failures — they will not fix themselves', async () => {
    (service as any).listRetryDelaysMs = [1, 1];
    const err: any = new Error('Invalid Credentials');
    err.response = { status: 401 };
    listMock.mockRejectedValue(err);

    await expect(
      service.fetchEmails('user-1', {
        since: new Date(Date.now() - 86400000),
      }),
    ).rejects.toThrow('Invalid Credentials');

    expect(listMock).toHaveBeenCalledTimes(1);
  });

  it('returns an empty inbox without calling the API when credentials are unconfigured', async () => {
    const mockService = new GmailService(
      { get: vi.fn().mockReturnValue('mock-google-client-id') } as any,
      { user: { update: vi.fn() } } as any,
      { getUserTokens: vi.fn() } as any,
    );
    const clientSpy = vi.spyOn(mockService, 'getAuthenticatedClient');

    const emails = await mockService.fetchEmails('user-1', {
      since: new Date(Date.now() - 86400000),
    });

    expect(emails).toEqual([]);
    expect(clientSpy).not.toHaveBeenCalled();
  });
});

describe('GmailService.fetchEmailContent', () => {
  let service: GmailService;
  let getMock: any;

  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

  beforeEach(() => {
    getMock = vi.fn();
    service = new GmailService(
      { get: vi.fn().mockReturnValue('fake-client-id') } as any,
      { user: { update: vi.fn() } } as any,
      { getUserTokens: vi.fn() } as any,
    );
    vi.spyOn(service, 'getAuthenticatedClient').mockResolvedValue({
      users: { messages: { get: getMock } },
    } as any);
  });

  it('prefers the text/plain part of a multipart body', async () => {
    getMock.mockResolvedValue({
      data: {
        payload: {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: b64('Deadline: Monday 2pm') } },
            { mimeType: 'text/html', body: { data: b64('<p>Deadline: Monday 2pm</p>') } },
          ],
        },
      },
    });

    expect(await service.fetchEmailContent('user-1', 'msg-1')).toBe(
      'Deadline: Monday 2pm',
    );
  });

  it('falls back to tag-stripped HTML when no plain part exists', async () => {
    getMock.mockResolvedValue({
      data: {
        payload: {
          mimeType: 'text/html',
          body: { data: b64('<div><b>Deadline:</b> Monday 2pm</div>') },
        },
      },
    });

    expect(await service.fetchEmailContent('user-1', 'msg-1')).toBe(
      'Deadline: Monday 2pm',
    );
  });

  it('truncates long bodies to a bounded excerpt', async () => {
    getMock.mockResolvedValue({
      data: {
        payload: { mimeType: 'text/plain', body: { data: b64('x'.repeat(9000)) } },
      },
    });

    const excerpt = await service.fetchEmailContent('user-1', 'msg-1');
    expect(excerpt.length).toBeLessThanOrEqual(4001); // 4000 chars + ellipsis
  });

  it('returns empty string in mock mode without an API call', async () => {
    const mockService = new GmailService(
      { get: vi.fn().mockReturnValue('mock-google-client-id') } as any,
      {} as any,
      {} as any,
    );

    expect(await mockService.fetchEmailContent('user-1', 'msg-1')).toBe('');
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe('GmailService.getAuthenticatedClient token refresh', () => {
  const makeService = (tokenExpiresAt: Date | null) =>
    new GmailService(
      {
        get: vi.fn((k: string) =>
          k === 'GOOGLE_CLIENT_ID'
            ? 'real-client-id'
            : k === 'ENCRYPTION_KEY'
              ? 'ab'.repeat(32)
              : 'secret',
        ),
      } as any,
      { user: { update: vi.fn().mockResolvedValue({}) } } as any,
      {
        getUserTokens: vi.fn().mockResolvedValue({
          accessToken: 'stored-access',
          refreshToken: 'stored-refresh',
          tokenExpiresAt,
        }),
      } as any,
    );

  it('throws when refresh fails and the stored token is already expired', async () => {
    (globalThis as any).__refreshImpl = () =>
      Promise.reject(new Error('invalid_grant'));
    const service = makeService(new Date(Date.now() - 60_000));

    await expect(service.getAuthenticatedClient('user-1')).rejects.toThrow(
      /refresh failed.*expired.*invalid_grant/i,
    );
  });

  it('continues on grace when refresh fails but the stored token is still valid', async () => {
    (globalThis as any).__refreshImpl = () =>
      Promise.reject(new Error('socket hang up'));
    const service = makeService(new Date(Date.now() + 2 * 60_000));

    await expect(
      service.getAuthenticatedClient('user-1'),
    ).resolves.toBeDefined();
  });
});
