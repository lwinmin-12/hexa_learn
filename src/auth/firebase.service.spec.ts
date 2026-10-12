import { ConfigService } from '@nestjs/config';
import { FirebaseService } from './firebase.service.js';

const admin = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock('firebase-admin/app', () => ({
  applicationDefault: vi.fn(),
  getApps: () => [],
  initializeApp: vi.fn(),
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => admin }));

describe('FirebaseService', () => {
  let service: FirebaseService;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    service = new FirebaseService(
      new ConfigService({
        FIREBASE_PROJECT_ID: 'test-project',
        FIREBASE_WEB_API_KEY: 'test-key',
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('verifies signatures and checks revocation/disabled users', async () => {
    admin.verifyIdToken.mockResolvedValue({ uid: 'user' });
    await expect(service.verifyIdToken('token')).resolves.toEqual({
      uid: 'user',
    });
    expect(admin.verifyIdToken).toHaveBeenCalledWith('token', true);
  });

  it.each([
    'auth/id-token-expired',
    'auth/id-token-revoked',
    'auth/user-disabled',
    'auth/argument-error',
  ])('returns 401 for %s', async (code) => {
    admin.verifyIdToken.mockRejectedValue({ code });
    await expect(service.verifyIdToken('token')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('does not misreport Firebase outages as invalid user credentials', async () => {
    admin.verifyIdToken.mockRejectedValue(new Error('network unavailable'));
    await expect(service.verifyIdToken('token')).rejects.toMatchObject({
      status: 503,
    });
  });

  it('passes client reCAPTCHA proof to Firebase without bypassing app verification', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ sessionInfo: 'session' })),
    );
    await expect(
      service.sendVerificationCode('+84912345678', 'captcha'),
    ).resolves.toBe('session');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      phoneNumber: '+84912345678',
      recaptchaToken: 'captcha',
    });
  });

  it('links the phone using the current user ID token', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ localId: 'uid', phoneNumber: '+84912345678' }),
      ),
    );
    await service.verifyPhone(
      'session',
      '123456',
      'current-token',
      'uid',
      '+84912345678',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      sessionInfo: 'session',
      code: '123456',
      idToken: 'current-token',
    });
  });

  it.each([
    { localId: 'other-user', phoneNumber: '+84912345678' },
    { localId: 'uid', phoneNumber: '+84999999999' },
  ])('rejects mismatched phone verification %j', async (result) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(result)));
    await expect(
      service.verifyPhone('s', '123456', 'token', 'uid', '+84912345678'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects Firebase temporary proof instead of marking another account phone as verified', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          temporaryProof: 'proof',
          phoneNumber: '+84912345678',
        }),
      ),
    );
    await expect(
      service.verifyPhone('s', '123456', 'token', 'uid', '+84912345678'),
    ).rejects.toMatchObject({ status: 409 });
  });

  it.each([
    ['INVALID_CODE', 400],
    ['SESSION_EXPIRED', 400],
    ['CAPTCHA_CHECK_FAILED', 400],
    ['TOO_MANY_ATTEMPTS_TRY_LATER', 429],
    ['PHONE_NUMBER_EXISTS', 409],
    ['INVALID_ID_TOKEN', 401],
    ['OPERATION_NOT_ALLOWED', 503],
  ])('maps Firebase error %s to HTTP %i', async (message, status) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message } }), { status: 400 }),
    );
    await expect(
      service.sendVerificationCode('+84912345678', 'captcha'),
    ).rejects.toMatchObject({ status });
  });

  it('handles network failures without exposing tokens or provider internals', async () => {
    fetchMock.mockRejectedValue(new Error('secret token'));
    await expect(
      service.sendVerificationCode('+84912345678', 'captcha'),
    ).rejects.toMatchObject({
      status: 503,
      message: 'Firebase phone authentication is unavailable',
    });
  });

  it('treats an already deleted Firebase user as successful cleanup', async () => {
    admin.deleteUser.mockRejectedValue({ code: 'auth/user-not-found' });
    await expect(service.deleteUser('uid')).resolves.toBeUndefined();
  });
});
