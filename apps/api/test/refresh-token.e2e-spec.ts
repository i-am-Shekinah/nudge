import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RefreshTokenService } from '../src/modules/auth/refresh-token.service.js';

interface FakeRow {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

describe('Session refresh tokens (e2e)', () => {
  let app: INestApplication;
  let refreshService: RefreshTokenService;
  let store: Map<string, FakeRow>;
  let seq: number;

  const fakeUser = {
    id: 'refresh-user-id',
    email: 'refresh@example.com',
    name: 'Refresh User',
  };

  const hash = (t: string) => createHash('sha256').update(t).digest('hex');

  beforeAll(async () => {
    store = new Map<string, FakeRow>();
    seq = 0;

    const prismaMock = {
      $connect: () => Promise.resolve(),
      $disconnect: () => Promise.resolve(),
      user: {
        findUnique: ({ where }: any) =>
          Promise.resolve(where.id === fakeUser.id ? fakeUser : null),
        findFirst: () => Promise.resolve(null),
      },
      sessionRefreshToken: {
        create: ({ data }: any) => {
          const row = { id: `row-${seq++}`, ...data, consumedAt: null };
          store.set(data.tokenHash, row);
          return Promise.resolve(row);
        },
        findUnique: ({ where }: any) => {
          const row = store.get(where.tokenHash);
          return Promise.resolve(row ? { ...row, user: fakeUser } : null);
        },
        updateMany: ({ where, data }: any) => {
          const row = store.get(where.tokenHash);
          if (row && !row.consumedAt) {
            row.consumedAt = data.consumedAt;
            return Promise.resolve({ count: 1 });
          }
          return Promise.resolve({ count: 0 });
        },
        deleteMany: ({ where }: any) => {
          const before = store.size;
          for (const [key, row] of store) {
            if (row.userId === where.userId) store.delete(key);
          }
          return Promise.resolve({ count: before - store.size });
        },
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    refreshService = moduleFixture.get<RefreshTokenService>(RefreshTokenService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/refresh rotates the token and returns a usable JWT', async () => {
    const refreshToken = await refreshService.issue(fakeUser.id);

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).not.toBe(refreshToken);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`)
      .expect(200);
  });

  it('reusing a consumed refresh token gets 401 and revokes the whole chain', async () => {
    const first = await refreshService.issue(fakeUser.id);
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: first })
      .expect(200);

    // Replay of the consumed token: detected as theft, chain revoked.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: first })
      .expect(401);

    // The replacement token must be dead too (chain revocation).
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: res.body.refreshToken })
      .expect(401);
  });

  it('an expired refresh token gets 401', async () => {
    const refreshToken = await refreshService.issue(fakeUser.id);
    store.get(hash(refreshToken))!.expiresAt = new Date(Date.now() - 1000);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('an unknown or missing token gets 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'never-issued' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({})
      .expect(401);
  });
});
