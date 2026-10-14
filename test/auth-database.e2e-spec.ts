import 'reflect-metadata';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { AuthModule } from '../dist/auth/auth.module.js';
import { FirebaseAdminService } from '../dist/firebase-admin/firebase-admin.service.js';
import { PrismaService } from '../dist/prisma/prisma.service.js';
import { AccountDeletionService } from '../dist/auth/account-deletion.service.js';
import { createValidationPipe } from '../dist/validation.js';

// Opt in: migrations and data are confined to a newly created test schema.
describe.skipIf(process.env.RUN_DATABASE_TESTS !== '1')(
  'Auth with PostgreSQL',
  () => {
    const schema = `auth_test_${randomUUID().replaceAll('-', '')}`;
    let client: pg.Client;
    let app: INestApplication;
    let db: PrismaService;
    let uid: string;
    let phone: string;
    const firebase = {
      verifyIdToken: vi.fn(),
      sendVerificationCode: vi.fn(),
      verifyPhone: vi.fn(),
      deleteUser: vi.fn(),
    };
    const bearer = { Authorization: 'Bearer valid-token' };
    const login = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ idToken: 'valid-token' });
    const sendOtp = () =>
      request(app.getHttpServer())
        .post('/auth/phone/send-otp')
        .set(bearer)
        .send({ phone, recaptchaToken: 'captcha' });
    const verifyOtp = (verificationId: string) =>
      request(app.getHttpServer())
        .post('/auth/phone/verify-otp')
        .set(bearer)
        .send({ verificationId, code: '123456' });

    beforeAll(async () => {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl)
        throw new Error(
          'DATABASE_URL is required for database integration tests',
        );
      client = new pg.Client({ connectionString: databaseUrl });
      await client.connect();
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      const migrations = (
        await readdir(new URL('../prisma/migrations/', import.meta.url))
      )
        .filter((name) => /^\d/.test(name))
        .sort();
      for (const migration of migrations) {
        await client.query(
          await readFile(
            new URL(
              `../prisma/migrations/${migration}/migration.sql`,
              import.meta.url,
            ),
            'utf8',
          ),
        );
      }
      const url = new URL(databaseUrl);
      url.searchParams.set('schema', schema);
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => ({ DATABASE_URL: url.toString() })],
          }),
          AuthModule,
        ],
      })
        .overrideProvider(FirebaseAdminService)
        .useValue(firebase)
        .overrideProvider(AccountDeletionService)
        .useValue({ flush: vi.fn().mockResolvedValue(undefined) })
        .compile();
      app = module.createNestApplication();
      app.useGlobalPipes(createValidationPipe());
      await app.init();
      db = module.get(PrismaService);
    }, 30000);

    beforeEach(() => {
      vi.resetAllMocks();
      uid = randomUUID();
      phone = `+84${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
      firebase.verifyIdToken.mockResolvedValue({
        uid,
        email: 'learner@example.test',
        name: 'Learner',
        picture: 'https://example.test/avatar.png',
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_provider: 'google.com' },
      });
      firebase.sendVerificationCode.mockResolvedValue('firebase-session');
      firebase.verifyPhone.mockResolvedValue(undefined);
      firebase.deleteUser.mockResolvedValue(undefined);
    });

    afterAll(async () => {
      await app?.close();
      if (client) {
        // Only the generated schema from this test run is removed.
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await client.end();
      }
    });

    it('handles concurrent first logins without duplicate users', async () => {
      const responses = await Promise.all([login(), login(), login()]);
      expect(responses.map((response) => response.status)).toEqual([
        200, 200, 200,
      ]);
      expect(new Set(responses.map((response) => response.body.id)).size).toBe(
        1,
      );
      expect(await db.user.count({ where: { firebaseUid: uid } })).toBe(1);
      expect(responses[0].body.role).toBe('learner');
    });

    it('persists profile edits and does not overwrite them on login', async () => {
      await login().expect(200);
      await request(app.getHttpServer())
        .patch('/me')
        .set(bearer)
        .send({ displayName: 'Updated', avatarUrl: null })
        .expect(200);
      const result = await login().expect(200);
      expect(result.body).toMatchObject({
        displayName: 'Updated',
        avatarUrl: null,
      });
    });

    it('denies suspended accounts and invalid Firebase tokens', async () => {
      const result = await login().expect(200);
      await db.user.update({
        where: { id: result.body.id },
        data: { status: 'suspended' },
      });
      await login().expect(403);
      await request(app.getHttpServer()).get('/me').set(bearer).expect(403);
      firebase.verifyIdToken.mockRejectedValue(new UnauthorizedException());
      await login().expect(401);
    });

    it('requires supported social providers for new users', async () => {
      firebase.verifyIdToken.mockResolvedValue({
        uid,
        firebase: { sign_in_provider: 'anonymous' },
      });
      await login().expect(400);
      expect(await db.user.count({ where: { firebaseUid: uid } })).toBe(0);
    });

    it('binds OTP to the current user and persists verification only after Firebase succeeds', async () => {
      const result = await login().expect(200);
      const sent = await sendOtp().expect(200);
      const verified = await verifyOtp(sent.body.verificationId).expect(200);
      expect(verified.body.phone).toBe(phone);
      expect(verified.body.phoneVerifiedAt).toBeTruthy();
      expect(firebase.verifyPhone).toHaveBeenCalledWith(
        'firebase-session',
        '123456',
        'valid-token',
        uid,
        phone,
      );
      expect(
        await db.phoneVerification.count({ where: { userId: result.body.id } }),
      ).toBe(0);
      await verifyOtp(sent.body.verificationId).expect(400);
    });

    it('allows only one of concurrent OTP resends', async () => {
      await login().expect(200);
      const responses = await Promise.all([sendOtp(), sendOtp()]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 429,
      ]);
      expect(firebase.sendVerificationCode).toHaveBeenCalledTimes(1);
    });

    it('limits incorrect codes and leaves the profile unverified', async () => {
      const result = await login().expect(200);
      const sent = await sendOtp().expect(200);
      firebase.verifyPhone.mockRejectedValue(
        new BadRequestException('Invalid code'),
      );
      for (let i = 0; i < 5; i++)
        await verifyOtp(sent.body.verificationId).expect(400);
      await verifyOtp(sent.body.verificationId).expect(429);
      expect(firebase.verifyPhone).toHaveBeenCalledTimes(5);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: result.body.id } }))
          .phoneVerifiedAt,
      ).toBeNull();
    });

    it('rejects expired and other-user verification IDs before contacting Firebase', async () => {
      const result = await login().expect(200);
      const sent = await sendOtp().expect(200);
      await verifyOtp(randomUUID()).expect(400);
      await db.phoneVerification.update({
        where: { userId: result.body.id },
        data: { expiresAt: new Date(0) },
      });
      await verifyOtp(sent.body.verificationId).expect(400);
      expect(firebase.verifyPhone).not.toHaveBeenCalled();
    });

    it('reports phone uniqueness conflicts without setting verification time', async () => {
      await db.user.create({
        data: { firebaseUid: randomUUID(), provider: 'google', phone },
      });
      const result = await login().expect(200);
      const sent = await sendOtp().expect(200);
      await verifyOtp(sent.body.verificationId).expect(409);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: result.body.id } }))
          .phoneVerifiedAt,
      ).toBeNull();
    });

    it('registers tokens idempotently and prevents deleting another account token', async () => {
      const result = await login().expect(200);
      const token = randomUUID();
      for (let i = 0; i < 2; i++) {
        await request(app.getHttpServer())
          .post('/me/device-tokens')
          .set(bearer)
          .send({ token, platform: 'ios' })
          .expect(201);
      }
      expect(
        await db.deviceToken.count({ where: { userId: result.body.id } }),
      ).toBe(1);
      const other = await db.user.create({
        data: { firebaseUid: randomUUID(), provider: 'apple' },
      });
      await db.deviceToken.create({
        data: { userId: other.id, fcmToken: 'other-' + token, platform: 'web' },
      });
      await request(app.getHttpServer())
        .delete('/me/device-tokens/other-' + token)
        .set(bearer)
        .expect(204);
      expect(await db.deviceToken.count({ where: { userId: other.id } })).toBe(
        1,
      );
      await request(app.getHttpServer())
        .delete('/me/device-tokens/' + token)
        .set(bearer)
        .expect(204);
      expect(
        await db.deviceToken.count({ where: { userId: result.body.id } }),
      ).toBe(0);
    });

    it('anonymizes accounts, retains history, and retries Firebase deletion after failure', async () => {
      const result = await login().expect(200);
      const userId = result.body.id;
      const course = await db.course.create({
        data: { ownerId: userId, title: 'Retained course', slug: randomUUID() },
      });
      await db.enrollment.create({
        data: { userId, courseId: course.id, accessType: 'free' },
      });
      await db.deviceToken.create({
        data: { userId, fcmToken: randomUUID(), platform: 'android' },
      });
      await sendOtp().expect(200);
      await request(app.getHttpServer()).delete('/me').set(bearer).expect(202);
      const deleted = await db.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(deleted).toMatchObject({
        email: null,
        displayName: null,
        avatarUrl: null,
        phone: null,
        status: 'suspended',
        firebaseDeletedAt: null,
      });
      expect(deleted.deletedAt).toBeTruthy();
      expect(await db.deviceToken.count({ where: { userId } })).toBe(0);
      expect(await db.phoneVerification.count({ where: { userId } })).toBe(0);
      expect(await db.enrollment.count({ where: { userId } })).toBe(1);
      expect(await db.course.count({ where: { id: course.id } })).toBe(1);
      await login().expect(401);
      await request(app.getHttpServer()).get('/me').set(bearer).expect(401);
      await expect(
        db.withActiveUser(userId, () => Promise.resolve()),
      ).rejects.toMatchObject({ status: 401 });
      const worker = new AccountDeletionService(
        db,
        firebase as unknown as FirebaseAdminService,
      );
      firebase.deleteUser.mockRejectedValueOnce(new Error('unavailable'));
      await worker.flush();
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: userId } }))
          .firebaseDeletedAt,
      ).toBeNull();
      await worker.flush();
      expect(firebase.deleteUser).toHaveBeenCalledWith(uid);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: userId } }))
          .firebaseDeletedAt,
      ).toBeTruthy();
    });

    it('requires a recent sign-in for deletion', async () => {
      await login().expect(200);
      firebase.verifyIdToken.mockResolvedValue({
        uid,
        auth_time: Math.floor(Date.now() / 1000) - 600,
      });
      await request(app.getHttpServer()).delete('/me').set(bearer).expect(401);
      expect(
        (await db.user.findUniqueOrThrow({ where: { firebaseUid: uid } }))
          .deletedAt,
      ).toBeNull();
    });
  },
);
