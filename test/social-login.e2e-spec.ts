import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthModule } from '../dist/auth/auth.module.js';
import { FirebaseAdminService } from '../dist/firebase-admin/firebase-admin.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { AccountDeletionService } from '../dist/auth/account-deletion.service.js';
import { createValidationPipe } from '../dist/validation.js';

describe('Social login HTTP flow', () => {
  let app: INestApplication;
  const firebase = { verifyIdToken: vi.fn() };
  const users = new Map<string, Record<string, unknown>>();
  const db = {
    user: {
      findUnique: vi.fn(
        async ({ where }) => users.get(where.firebaseUid) ?? null,
      ),
      create: vi.fn(async ({ data }) => {
        const user = {
          ...data,
          id: 'local-user',
          role: 'learner',
          status: 'active',
          deletedAt: null,
        };
        users.set(data.firebaseUid, user);
        return user;
      }),
    },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(FirebaseAdminService)
      .useValue(firebase)
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(AccountDeletionService)
      .useValue({ flush: vi.fn() })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });
  beforeEach(() => {
    users.clear();
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await app?.close();
  });

  it.each(['google', 'apple', 'facebook'])(
    'logs in a new %s user, reads their profile, and reuses the account',
    async (provider) => {
      firebase.verifyIdToken.mockResolvedValue({
        uid: 'firebase-user',
        firebase: { sign_in_provider: `${provider}.com` },
      });
      const login = () =>
        request(app.getHttpServer())
          .post('/auth/login')
          .send({ idToken: 'valid-token' });
      const first = await login().expect(200);
      expect(first.body).toMatchObject({
        id: 'local-user',
        role: 'learner',
        provider,
      });
      expect(first.body.firebaseUid).toBeUndefined();
      const me = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);
      expect(me.body).toEqual(first.body);
      await login().expect(200);
      expect(db.user.create).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects invalid tokens without creating an account', async () => {
    firebase.verifyIdToken.mockRejectedValue(
      new UnauthorizedException('Invalid token'),
    );
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ idToken: 'bad-token' })
      .expect(401);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('rejects suspended accounts on login and protected routes', async () => {
    firebase.verifyIdToken.mockResolvedValue({
      uid: 'blocked',
      firebase: { sign_in_provider: 'google.com' },
    });
    users.set('blocked', { id: 'blocked', status: 'suspended' });
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ idToken: 'token' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer token')
      .expect(403);
  });
});
