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
});
