import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GmailService } from '../src/modules/gmail/gmail.service.js';

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
    listMock.mockRejectedValueOnce(
      new Error('Client network socket disconnected before secure TLS connection'),
    );

    await expect(
      service.fetchEmails('user-1', {
        since: new Date(Date.now() - 86400000),
      }),
    ).rejects.toThrow('Client network socket disconnected');
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
