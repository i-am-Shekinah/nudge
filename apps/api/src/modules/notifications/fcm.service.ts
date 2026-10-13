import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/**
 * Minimal FCM HTTP v1 transport: signs a service-account JWT assertion with
 * node:crypto and caches the OAuth access token. No credentials configured →
 * mock mode, matching how web-push and email behave in this codebase.
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private readonly account: ServiceAccount | null = null;
  private readonly projectId: string | null = null;
  private cached: CachedToken | null = null;

  constructor(private readonly configService: ConfigService) {
    this.projectId = this.configService.get<string>('FCM_PROJECT_ID') || null;
    const keyPath = this.configService.get<string>('FCM_SERVICE_ACCOUNT_JSON');
    if (this.projectId && keyPath) {
      try {
        this.account = JSON.parse(readFileSync(keyPath, 'utf8'));
      } catch (err) {
        this.logger.error(
          `Failed to read FCM_SERVICE_ACCOUNT_JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (!this.account) {
      this.logger.warn('FCM credentials not set. Operating in mock native-push mode.');
    }
  }

  get isConfigured(): boolean {
    return !!this.account && !!this.projectId;
  }

  async send(
    registrationToken: string,
    payload: { title: string; body: string; url: string },
  ): Promise<void> {
    if (!this.isConfigured) {
      this.logger.log(`[MOCK FCM] ${payload.title}: ${payload.body}`);
      return;
    }

    try {
      const accessToken = await this.getAccessToken();
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: registrationToken,
              notification: { title: payload.title, body: payload.body },
              data: { url: payload.url },
              android: { priority: 'HIGH', notification: { clickAction: 'OPEN_ACTIVITY_1' } },
            },
          }),
        },
      );
      if (!res.ok) {
        this.logger.warn(`FCM send failed (${res.status}): ${await res.text()}`);
        return;
      }
      this.logger.log(`FCM push sent: ${payload.title}`);
    } catch (err) {
      this.logger.warn(
        `FCM delivery error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now() + 60_000) {
      return this.cached.value;
    }

    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: this.account!.client_email,
      scope: FCM_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };
    const b64 = (s: string) => Buffer.from(s).toString('base64url');
    const unsigned = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify(claims))}`;
    const signature = createSign('RSA-SHA256')
      .update(unsigned)
      .sign(this.account!.private_key, 'base64url');
    const assertion = `${unsigned}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) {
      throw new Error(`OAuth token exchange failed (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    this.cached = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return this.cached.value;
  }
}
