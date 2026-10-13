import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthCodeService } from '../src/modules/auth/auth-code.service.js';

interface FakeRow {
  codeHash: string;
  userId: string;
  isNewUser: boolean;
  expiresAt: Date;
  consumedAt: Date | null;
}

describe('Auth code exchange (e2e)', () => {
  let app: INestApplication;
  let authCodeService: AuthCodeService;
  let store: Map<string, FakeRow>;

  const fakeUser = {
    id: 'mobile-user-id',
    email: 'mobile@example.com',
    name: 'Mobile User',
    avatarUrl: null,
    gmailConnected: true,
  };

  beforeAll(async () => {
    store = new Map<string, FakeRow>();

    const prismaMock = {
      $connect: () => Promise.resolve(),
      $disconnect: () => Promise.resolve(),
      user: {
        findUnique: ({ where }: any) =>
          Promise.resolve(where.id === fakeUser.id ? fakeUser : null),
        findFirst: () => Promise.resolve(null),
        upsert: () => Promise.resolve(fakeUser),
      },
      sessionRefreshToken: {
        create: () => Promise.resolve({ id: 'fake-refresh' }),
      },
      authCode: {
        create: ({ data }: any) => {
          store.set(data.codeHash, { ...data, consumedAt: null });
          return Promise.resolve({ id: data.codeHash });
        },
        deleteMany: () => {
          store.clear();
          return Promise.resolve({ count: 0 });
        },
        findUnique: ({ where }: any) => {
          const row = store.get(where.codeHash);
          return Promise.resolve(row ? { ...row, user: fakeUser } : null);
        },
        updateMany: ({ where, data }: any) => {
          const row = store.get(where.codeHash);
          if (row && !row.consumedAt) {
            row.consumedAt = data.consumedAt;
            return Promise.resolve({ count: 1 });
          }
          return Promise.resolve({ count: 0 });
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
    authCodeService = moduleFixture.get<AuthCodeService>(AuthCodeService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/exchange rejects a missing code with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/exchange')
      .send({})
      .expect(401);
  });

  it('POST /auth/exchange rejects an unknown code with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/exchange')
      .send({ code: 'never-issued' })
      .expect(401);
  });

  it('POST /auth/exchange returns a usable JWT for a fresh code', async () => {
    const code = await authCodeService.create(fakeUser.id, false);

    const res = await request(app.getHttpServer())
      .post('/auth/exchange')
      .send({ code })
      .expect(200);

    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.isNewUser).toBe(false);

    // The JWT must authenticate protected routes.
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`)
      .expect(200);
  });

  it('a code is single-use: second exchange gets 401', async () => {
    const code = await authCodeService.create(fakeUser.id, false);
    await request(app.getHttpServer())
      .post('/auth/exchange')
      .send({ code })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/exchange')
      .send({ code })
      .expect(401);
  });

  it('an expired code gets 401', async () => {
    const code = await authCodeService.create(fakeUser.id, false);
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(code).digest('hex');
    store.get(hash)!.expiresAt = new Date(Date.now() - 1000);

    await request(app.getHttpServer())
      .post('/auth/exchange')
      .send({ code })
      .expect(401);
  });

  it('GET /auth/google forwards client=mobile through OAuth state', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/google?client=mobile')
      .expect(302);
    expect(new URL(res.headers.location).searchParams.get('state')).toBe(
      'mobile',
    );
  });

  it('GET /auth/google with a hostile client value still resolves to web', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/google?client=https://evil.example')
      .expect(302);
    expect(new URL(res.headers.location).searchParams.get('state')).toBe('web');
  });
});
