import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Auth & Guards (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $connect: () => Promise.resolve(),
        $disconnect: () => Promise.resolve(),
        user: {
          findUnique: (args: any) => {
            if (args.where.id === 'test-user-id') {
              return Promise.resolve({
                id: 'test-user-id',
                email: 'test@example.com',
                name: 'Test User',
                avatarUrl: null,
                gmailConnected: true,
                timezone: 'UTC',
                notificationTime: '07:00',
                reminderPreset: 'DEFAULT',
                customReminders: [4320, 1440, 60, 30, 5],
              });
            }
            return Promise.resolve(null);
          },
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / should allow access to public endpoint', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);
    expect(res.text).toBe('Hello World!');
  });

  it('GET /auth/me should reject request without token with 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /auth/me should reject invalid bearer token with 401', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer invalid.token.payload')
      .expect(401);
  });

  it('GET /auth/me should return user profile with valid JWT', async () => {
    const validToken = jwtService.sign({
      sub: 'test-user-id',
      email: 'test@example.com',
    });

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
    });
  });
});
