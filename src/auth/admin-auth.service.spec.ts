import { Test } from '@nestjs/testing';
import { AdminAuthService } from './admin-auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FirebaseAdminService } from '../firebase-admin/firebase-admin.service.js';

const activeAdmin = {
  id: 'admin-id',
  firebaseUid: 'firebase-admin',
  email: 'admin@example.com',
  displayName: 'Administrator',
  avatarUrl: null,
  role: 'super_admin',
  status: 'active',
  deletedAt: null,
  phoneVerifiedAt: null,
  provider: 'password',
};

describe('admin password authentication', () => {
  const db = { user: { findUnique: vi.fn() } };
  const firebase = { verifyIdToken: vi.fn() };
  const fetchMock = vi.fn();
  let service: AdminAuthService;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubEnv('FIREBASE_WEB_API_KEY', 'test-key');
    vi.stubGlobal('fetch', fetchMock);
    firebase.verifyIdToken.mockResolvedValue({
      uid: 'firebase-admin',
      firebase: { sign_in_provider: 'password' },
    });
    db.user.findUnique.mockResolvedValue(activeAdmin);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          idToken: 'access',
          refreshToken: 'refresh',
          expiresIn: '3600',
        }),
      ),
    );
    const module = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: PrismaService, useValue: db },
        { provide: FirebaseAdminService, useValue: firebase },
      ],
    }).compile();
    service = module.get(AdminAuthService);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns a session only after verifying the Firebase token and stored admin role', async () => {
    await expect(
      service.login('admin@example.com', 'password'),
    ).resolves.toMatchObject({
      idToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 3600,
      user: { id: 'admin-id', role: 'super_admin' },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      email: 'admin@example.com',
      password: 'password',
      returnSecureToken: true,
    });
    expect(firebase.verifyIdToken).toHaveBeenCalledWith('access');
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { firebaseUid: 'firebase-admin' },
    });
  });

  it.each([
    null,
    { ...activeAdmin, role: 'learner' },
    { ...activeAdmin, status: 'suspended' },
    { ...activeAdmin, deletedAt: new Date() },
  ])(
    'does not issue an admin session for an unavailable or unauthorized account',
    async (user) => {
      db.user.findUnique.mockResolvedValue(user);
      await expect(
        service.login('admin@example.com', 'password'),
      ).rejects.toMatchObject({ status: 401 });
    },
  );

  it('refreshes with form encoding and checks admin access again', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            id_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: '3600',
          }),
        ),
    );
    await expect(service.refresh('old-refresh')).resolves.toMatchObject({
      idToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    expect(fetchMock.mock.calls[0][1].body.toString()).toBe(
      'grant_type=refresh_token&refresh_token=old-refresh',
    );
    db.user.findUnique.mockResolvedValue({ ...activeAdmin, role: 'learner' });
    await expect(service.refresh('old-refresh')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('rejects a revoked ID token before accessing account data', async () => {
    firebase.verifyIdToken.mockRejectedValue(new Error('Token revoked'));
    await expect(service.refresh('refresh')).rejects.toThrow('Token revoked');
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects social-provider tokens on the password login path', async () => {
    firebase.verifyIdToken.mockResolvedValue({
      uid: 'firebase-admin',
      firebase: { sign_in_provider: 'google.com' },
    });
    await expect(
      service.login('admin@example.com', 'password'),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('returns a generic credential error and does not query accounts on failure', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: 'INVALID_LOGIN_CREDENTIALS' } }),
        { status: 400 },
      ),
    );
    await expect(
      service.login('admin@example.com', 'bad'),
    ).rejects.toMatchObject({ status: 401 });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('preserves upstream sign-in throttling', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER' } }),
        { status: 400 },
      ),
    );
    await expect(
      service.login('admin@example.com', 'password'),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('reports missing configuration without sending credentials', async () => {
    vi.stubEnv('FIREBASE_WEB_API_KEY', '');
    await expect(
      service.login('admin@example.com', 'password'),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed token responses', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ idToken: 'access' })),
    );
    await expect(
      service.login('admin@example.com', 'password'),
    ).rejects.toMatchObject({ status: 503 });
  });
});
