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
        this.logger.error(
          `Failed to refresh OAuth token for user ${userId}: ${err.message}`,
        );
      }
    }

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  /**
   * Fetches metadata for emails within the specified date window.
   * NOTE: Does NOT fetch full email bodies, only subject, date, sender, and snippet.
   */
  async fetchEmails(
    userId: string,
    options: FetchEmailsOptions,
  ): Promise<EmailDto[]> {
    try {
      const gmail = await this.getAuthenticatedClient(userId);

      // Build Gmail query
      const sinceEpoch = Math.floor(options.since.getTime() / 1000);
      let query = `after:${sinceEpoch}`;
      if (options.until) {
        const untilEpoch = Math.floor(options.until.getTime() / 1000);
        query += ` before:${untilEpoch}`;
      }

      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: options.maxResults || 50,
      });

      const messages = listRes.data.messages || [];
      if (messages.length === 0) {
        return [];
      }

      // Fetch metadata in parallel
      const emailPromises = messages.map(async (msg) => {
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
          this.logger.warn(`Could not fetch message metadata for ${msg.id}: ${err.message}`);
          return null;
        }
      });

      const results = await Promise.all(emailPromises);
      return results.filter((email): email is EmailDto => email !== null);
    } catch (err: any) {
      this.logger.error(`Error in fetchEmails for user ${userId}: ${err.message}`);
      // Return empty array on failure or local mock
      return [];
    }
  }
}
