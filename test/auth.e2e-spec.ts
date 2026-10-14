import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
// Test the production compiler output so Nest receives DTO decorator metadata.
import { AuthController } from '../dist/auth/auth.controller.js';
import { MeController } from '../dist/auth/me.controller.js';
import { AuthService } from '../dist/auth/auth.service.js';
import { FirebaseAdminService } from '../dist/firebase-admin/firebase-admin.service.js';
import { AccountDeletionService } from '../dist/auth/account-deletion.service.js';
import { createValidationPipe } from '../dist/validation.js';

describe('Auth route contracts', () => {
  let app: INestApplication;
  const user = {
    id: 'user',
    role: 'learner',
    displayName: 'Learner',
    firebaseUid: 'uid',
  };
  const service = {
    login: vi.fn(),
    findActiveUser: vi.fn(),
    updateProfile: vi.fn(),
    sendOtp: vi.fn(),
    verifyOtp: vi.fn(),
    registerDevice: vi.fn(),
    removeDevice: vi.fn(),
    deleteAccount: vi.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController, MeController],
      providers: [
        { provide: AuthService, useValue: service },
        {
          provide: FirebaseAdminService,
          useValue: {
            verifyIdToken: vi.fn().mockResolvedValue({ uid: 'uid' }),
          },
        },
        {
          provide: AccountDeletionService,
          useValue: { flush: vi.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    service.findActiveUser.mockResolvedValue(user);
    service.login.mockResolvedValue({ id: 'user' });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('allows public login with a Firebase ID token body', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ idToken: 'firebase-token' })
      .expect(200);
    expect(service.login).toHaveBeenCalledWith('firebase-token');
  });

  it.each([
    ['get', '/me'],
    ['patch', '/me'],
    ['delete', '/me'],
    ['post', '/me/device-tokens'],
    ['delete', '/me/device-tokens/token'],
  ] as const)('requires authentication for %s %s', async (method, path) => {
    await request(app.getHttpServer())[method](path).expect(401);
  });

  it.each([
    ['/auth/login', {}],
    ['/auth/login', { idToken: '' }],
    ['/me/device-tokens', { token: 'token', platform: 'unknown' }],
  ])('validates the body of %s: %j', async (path, body) => {
    await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer token')
      .send(body)
      .expect(400);
  });

  it('rejects privilege escalation through PATCH /me', async () => {
    await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', 'Bearer token')
      .send({ role: 'super_admin' })
      .expect(400);
    expect(service.updateProfile).not.toHaveBeenCalled();
  });

  it('rejects non-http avatar URLs', async () => {
    await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', 'Bearer token')
      .send({ avatarUrl: 'javascript:alert(1)' })
      .expect(400);
  });

  it('does not expose Firebase UID in GET /me', async () => {
    const result = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer token')
      .expect(200);
    expect(result.body.id).toBe('user');
    expect(result.body.firebaseUid).toBeUndefined();
  });

  it('allows clearing optional profile values', async () => {
    await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', 'Bearer token')
      .send({ displayName: null, avatarUrl: null })
      .expect(200);
    expect(service.updateProfile).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({ displayName: null, avatarUrl: null }),
    );
  });

  it('accepts account deletion and removes device tokens with no response body', async () => {
    await request(app.getHttpServer())
      .delete('/me')
      .set('Authorization', 'Bearer token')
      .expect(202);
    await request(app.getHttpServer())
      .delete('/me/device-tokens/fcm%3Atoken')
      .set('Authorization', 'Bearer token')
      .expect(204);
    expect(service.removeDevice).toHaveBeenCalledWith('user', 'fcm:token');
  });
});
