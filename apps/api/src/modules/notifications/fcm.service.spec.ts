import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FcmService } from './fcm.service.js';
import { NotificationsService } from './notifications.service.js';

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe('FcmService', () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  let keyPath: string;

  beforeAll(() => {
    keyPath = join(tmpdir(), 'nudge-fcm-test-sa.json');
    writeFileSync(
      keyPath,
      JSON.stringify({ client_email: 'push@test.iam', private_key: privateKey }),
    );
  });

  afterAll(() => unlinkSync(keyPath));

  it('mocks sends without credentials and never touches the network', async () => {
    const svc = new FcmService(makeConfig({}));
    expect(svc.isConfigured).toBe(false);
    const spy = vi.spyOn(globalThis, 'fetch');
    await svc.send('tok', { title: 't', body: 'b', url: 'u' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('exchanges a JWT assertion then posts to the v1 messages endpoint', async () => {
    const svc = new FcmService(
      makeConfig({ FCM_PROJECT_ID: 'test-proj', FCM_SERVICE_ACCOUNT_JSON: keyPath }),
    );
    expect(svc.isConfigured).toBe(true);

    const calls: { url: string; init: RequestInit }[] = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return Response.json({ access_token: 'ya29.fake', expires_in: 3600 });
    });

    await svc.send('device-token', { title: 'Hi', body: 'There', url: '/dashboard' });
    spy.mockRestore();

    expect(calls).toHaveLength(2);
    // 1. OAuth token exchange with a jwt-bearer assertion
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
    const body = String(calls[0].init.body);
    expect(body).toContain('urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
    expect(body).toContain('assertion=');
    // 2. FCM v1 send on the right project
    expect(calls[1].url).toBe(
      'https://fcm.googleapis.com/v1/projects/test-proj/messages:send',
    );
    const message = JSON.parse(String(calls[1].init.body));
    expect(message.message.token).toBe('device-token');
    // Data-only: the shell renders notifications itself (OEM transports
    // replace custom small icons on notification-payload messages).
    expect(message.message.data.title).toBe('Hi');
    expect(message.message.notification).toBeUndefined();
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe(
      'Bearer ya29.fake',
    );
  });

  it('caches the OAuth token across sends', async () => {
    const svc = new FcmService(
      makeConfig({ FCM_PROJECT_ID: 'test-proj', FCM_SERVICE_ACCOUNT_JSON: keyPath }),
    );
    let fetches = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      fetches++;
      return Response.json({ access_token: 'ya29.fake', expires_in: 3600 });
    });
    await svc.send('a', { title: 't', body: 'b', url: 'u' });
    await svc.send('b', { title: 't', body: 'b', url: 'u' });
    spy.mockRestore();
    // 1 token exchange + 2 sends (not 2 exchanges + 2 sends)
    expect(fetches).toBe(3);
  });
});

describe('NotificationsService.dispatch channel choice', () => {
  const payload = { title: 't', body: 'b', url: 'u' };

  function makeService(fcmSend: ReturnType<typeof vi.fn>) {
    const config = makeConfig({});
    const prisma = {} as any;
    const fcm = { send: fcmSend } as any;
    return new NotificationsService(config, prisma, fcm);
  }

  it('prefers native Android over web push (no duplicate notifications)', async () => {
    const fcmSend = vi.fn();
    const svc = makeService(fcmSend);
    const webSpy = vi.spyOn(svc as any, 'sendPush');
    await svc.dispatch(
      { nativePushToken: 'fcm-tok', nativePushPlatform: 'android', pushSubscription: {} } as any,
      payload,
    );
    expect(fcmSend).toHaveBeenCalledWith('fcm-tok', payload);
    expect(webSpy).not.toHaveBeenCalled();
    webSpy.mockRestore();
  });

  it('falls back to web push when no native token exists', async () => {
    const fcmSend = vi.fn();
    const svc = makeService(fcmSend);
    const webSpy = vi.spyOn(svc as any, 'sendPush').mockResolvedValue(undefined);
    await svc.dispatch({ nativePushToken: null, pushSubscription: { endpoint: 'x' } } as any, payload);
    expect(fcmSend).not.toHaveBeenCalled();
    expect(webSpy).toHaveBeenCalledWith({ endpoint: 'x' }, payload);
    webSpy.mockRestore();
  });

  it('does nothing when the user has no channel at all', async () => {
    const fcmSend = vi.fn();
    const svc = makeService(fcmSend);
    const webSpy = vi.spyOn(svc as any, 'sendPush');
    await svc.dispatch({ nativePushToken: null, pushSubscription: null } as any, payload);
    expect(fcmSend).not.toHaveBeenCalled();
    expect(webSpy).not.toHaveBeenCalled();
    webSpy.mockRestore();
  });
});
