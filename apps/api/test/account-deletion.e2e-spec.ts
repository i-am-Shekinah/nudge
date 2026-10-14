import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthCodeService } from '../src/modules/auth/auth-code.service.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { encryptToken } from '../src/common/crypto.util.js';

describe('Account deletion (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let authCodeService: AuthCodeService;

  const fakeUser = {
    id: 'delete-me-user-id',
    email: 'delete-me@example.com',
    name: 'Delete Me',
    avatarUrl: null,
    gmailConnected: true,
  };

  const GOOGLE_REFRESH_TOKEN = 'google-refresh-secret';
  const deleteCalls: string[] = [];

  beforeAll(async () => {
    const prismaMock = {
      $connect: () => Promise.resolve(),
      $disconnect: () => Promise.resolve(),
      user: {
        findUnique: ({ where, select }: any) => {
          if (where.id !== fakeUser.id) return Promise.resolve(null);
          // The JWT strategy selects profile fields; getUserTokens selects
          // tokens. Serve each caller its own shape.
          if (select?.accessToken !== undefined) {
            const key = (authService as any).encryptionKey as string;
            return Promise.resolve({
              accessToken: encryptToken('google-access-secret', key),
              refreshToken: encryptToken(GOOGLE_REFRESH_TOKEN, key),
              tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
            });
          }
          return Promise.resolve(fakeUser);
        },
        findFirst: () => Promise.resolve(null),
        upsert: () => Promise.resolve(fakeUser),
        delete: ({ where }: any) => {
          deleteCalls.push(where.id);
          return Promise.resolve(fakeUser);
        },
      },
      sessionRefreshToken: {
        create: () => Promise.resolve({ id: 'fake-refresh' }),
      },
      authCode: {
        create: ({ data }: any) => Promise.resolve({ id: data.codeHash }),
        deleteMany: () => Promise.resolve({ count: 0 }),
        findUnique: ({ where }: any) =>
          Promise.resolve({
            codeHash: where.codeHash,
            userId: fakeUser.id,
            isNewUser: false,
            consumedAt: null,
            user: fakeUser,
          }),
        updateMany: () => Promise.resolve({ count: 1 }),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    authService = moduleFixture.get<AuthService>(AuthService);
    authCodeService = moduleFixture.get<AuthCodeService>(AuthCodeService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function authHeader(): Promise<string> {
    // Borrow the real login path: exchange a one-time code for a JWT.
    const code = await authCodeService.create(fakeUser.id, false);
    const res = await request(app.getHttpServer())
      .post('/auth/exchange')
      .send({ code })
      .expect(200);
    return `Bearer ${res.body.token}`;
  }

  it('DELETE /auth/account requires authentication', async () => {
    await request(app.getHttpServer()).delete('/auth/account').expect(401);
  });

  it('DELETE /auth/account revokes the Google grant and deletes the user row', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input: any) => {
        if (String(input).includes('oauth2.googleapis.com/revoke')) {
          return Promise.resolve(new Response('{}', { status: 200 }));
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

    const res = await request(app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', await authHeader())
      .expect(200);

    expect(res.body.success).toBe(true);

    const revokeCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).includes('oauth2.googleapis.com/revoke'),
    );
    expect(revokeCall).toBeDefined();
    expect(String(revokeCall![0])).toContain(
      `token=${encodeURIComponent(GOOGLE_REFRESH_TOKEN)}`,
    );
    expect(revokeCall![1]).toMatchObject({ method: 'POST' });

    expect(deleteCalls).toContain(fakeUser.id);

    fetchSpy.mockRestore();
  });

  it('DELETE /auth/account still deletes when Google revocation fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.reject(new Error('network down')),
    );

    deleteCalls.length = 0;

    await request(app.getHttpServer())
      .delete('/auth/account')
      .set('Authorization', await authHeader())
      .expect(200);

    expect(deleteCalls).toContain(fakeUser.id);

    vi.restoreAllMocks();
  });
});
