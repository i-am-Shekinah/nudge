import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthService } from '../auth/auth.service.js';
import { encryptToken } from '../../common/crypto.util.js';
import { EmailDto, FetchEmailsOptions } from './gmail.types.js';

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);
  // 3 attempts total: immediate, +2s, +8s — rides out a brief route flap
  private readonly listRetryDelaysMs = [2_000, 8_000];

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Initializes and returns an authenticated Gmail API client with auto-refresh.
   */
  async getAuthenticatedClient(userId: string) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    const tokens = await this.authService.getUserTokens(userId);

    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });

    // Check if token is near expiration (within 5 minutes)
    const now = new Date();
    const isNearExpiry =
      !tokens.tokenExpiresAt ||
      tokens.tokenExpiresAt.getTime() - now.getTime() < 5 * 60 * 1000;

    if (isNearExpiry && tokens.refreshToken) {
      try {
        this.logger.log(`Refreshing access token for user: ${userId}`);
        const { credentials } = await oauth2Client.refreshAccessToken();

        const encryptionKey =
          this.configService.get<string>('ENCRYPTION_KEY') ||
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

        const updatedAccessToken = credentials.access_token
          ? encryptToken(credentials.access_token, encryptionKey)
          : undefined;

        const updatedRefreshToken = credentials.refresh_token
          ? encryptToken(credentials.refresh_token, encryptionKey)
          : undefined;

        await this.prisma.user.update({
          where: { id: userId },
          data: {
            ...(updatedAccessToken ? { accessToken: updatedAccessToken } : {}),
            ...(updatedRefreshToken ? { refreshToken: updatedRefreshToken } : {}),
            tokenExpiresAt: credentials.expiry_date
              ? new Date(credentials.expiry_date)
              : new Date(Date.now() + 3600 * 1000),
          },
        });

        oauth2Client.setCredentials(credentials);
      } catch (err: any) {
        // Grace only makes sense while the stored token still works. If it is
        // already past expiry, continuing guarantees a misleading 401 from
        // every API call — surface the refresh failure instead.
        const expired = !tokens.tokenExpiresAt || tokens.tokenExpiresAt.getTime() <= Date.now();
        if (expired) {
          throw new Error(
            `OAuth token refresh failed for user ${userId} and the stored token is expired: ${err.message}`,
          );
        }
        this.logger.warn(
          `Token refresh failed for user ${userId}, but the stored token is still valid: ${err.message}`,
        );
      }
    }

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  /**
   * Fetches metadata for emails within the specified date window.
   * NOTE: Does NOT fetch full email bodies, only subject, date, sender, and snippet.
   * Fetch-level failures propagate so callers can mark the scan failed and keep
   * the cursor at the un-scanned window instead of silently reporting zero mail.
   */
  async fetchEmails(
    userId: string,
    options: FetchEmailsOptions,
  ): Promise<EmailDto[]> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId || clientId === 'mock-google-client-id') {
      this.logger.warn('Gmail credentials not configured. Returning empty inbox.');
      return [];
    }

    const gmail = await this.getAuthenticatedClient(userId);

    // Build Gmail query
    const sinceEpoch = Math.floor(options.since.getTime() / 1000);
    let query = `after:${sinceEpoch}`;
    if (options.until) {
      const untilEpoch = Math.floor(options.until.getTime() / 1000);
      query += ` before:${untilEpoch}`;
    }

    const messages = await this.listMessageIds(gmail, query);

    if (messages.length === 0) {
      return [];
    }

    const fetchOne = async (msg: (typeof messages)[number]) => {
      if (!msg.id) return null;
      try {
        const detailRes = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        });

        const headers = detailRes.data.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())
            ?.value || '';

        const subject = getHeader('Subject') || '(No Subject)';
        const from = getHeader('From') || '';
        const dateStr = getHeader('Date');
        const date = dateStr ? new Date(dateStr) : new Date();
        const snippet = detailRes.data.snippet || '';

        return {
          id: msg.id,
          threadId: msg.threadId || msg.id,
          subject,
          from,
          date: isNaN(date.getTime()) ? new Date() : date,
          snippet,
          gmailUrl: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
        } as EmailDto;
      } catch (err: any) {
        // A single unreadable message must not fail the whole scan.
        this.logger.warn(`Could not fetch message metadata for ${msg.id}: ${err.message}`);
        return null;
      }
    };

    // Bounded concurrency: a paginated window can hold thousands of IDs
    const METADATA_BATCH_SIZE = 50;
    const results: EmailDto[] = [];
    for (let i = 0; i < messages.length; i += METADATA_BATCH_SIZE) {
      const batch = await Promise.all(
        messages.slice(i, i + METADATA_BATCH_SIZE).map(fetchOne),
      );
      results.push(...batch.filter((email): email is EmailDto => email !== null));
    }
    return results;
  }

  /**
   * Fetches a transient text excerpt of one message's body, for date/deadline
   * extraction at classification time ONLY. The text is passed straight to the
   * prompt and never written to the database or any log.
   * Errors propagate: the caller degrades to snippet-only classification.
   */
  async fetchEmailContent(userId: string, messageId: string): Promise<string> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId || clientId === 'mock-google-client-id') {
      return '';
    }

    const gmail = await this.getAuthenticatedClient(userId);
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const text = this.extractBodyText(res.data.payload);
    const BODY_CHAR_LIMIT = 4000;
    return text.length > BODY_CHAR_LIMIT
      ? `${text.slice(0, BODY_CHAR_LIMIT)}…`
      : text;
  }

  private extractBodyText(
    payload?: {
      mimeType?: string | null;
      body?: { data?: string | null } | null;
      parts?: Array<{ mimeType?: string | null; body?: { data?: string | null } | null; parts?: any[] } | null> | null;
    } | null,
  ): string {
    if (!payload) return '';

    const decode = (data?: string | null) =>
      data
        ? Buffer.from(data, 'base64url').toString('utf8')
        : '';

    const collect = (
      part: { mimeType?: string | null; body?: { data?: string | null } | null; parts?: any[] } | undefined | null,
      kind: 'plain' | 'html',
    ): string => {
      if (!part?.mimeType) return '';
      if (part.mimeType === `text/${kind}`) return decode(part.body?.data);
      return (part.parts ?? [])
        .map((sub) => collect(sub, kind))
        .filter(Boolean)
        .join('\n');
    };

    const plain = collect(payload as any, 'plain');
    if (plain.trim()) return plain;

    const html = collect(payload as any, 'html');
    // crude tag-strip; this text only ever goes into the prompt
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Lists every message ID in the window, walking all pages. A transient
   * network blip is retried so it does not fail the whole scan; the cursor
   * stays as the backstop for hour-scale outages. Pagination restarts on
   * retry, which is safe because the listing itself is read-only.
   */
  private async listMessageIds(
    gmail: Awaited<ReturnType<GmailService['getAuthenticatedClient']>>,
    query: string,
  ): Promise<Array<{ id?: string | null; threadId?: string | null }>> {
    let attempt = 0;
    for (;;) {
      try {
        const listRes = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 500,
        });

        const messages = [...(listRes.data.messages ?? [])];
        let pageToken = listRes.data.nextPageToken;
        while (pageToken) {
          const nextRes = await gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults: 500,
            pageToken,
          });
          messages.push(...(nextRes.data.messages ?? []));
          pageToken = nextRes.data.nextPageToken;
        }
        return messages;
      } catch (err: any) {
        if (attempt >= this.listRetryDelaysMs.length || !this.isTransientError(err)) {
          throw err;
        }
        const delay = this.listRetryDelaysMs[attempt];
        attempt++;
        this.logger.warn(
          `Gmail messages.list failed (attempt ${attempt}/${this.listRetryDelaysMs.length + 1}): ` +
            `${err.message}. Retrying in ${delay}ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private isTransientError(err: any): boolean {
    const status = err?.response?.status ?? err?.status;
    if (typeof status === 'number') {
      return status >= 500 || status === 429;
    }
    const text = `${err?.code ?? ''} ${err?.message ?? ''}`;
    return /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|disconnected|network/i.test(
      text,
    );
  }
}
