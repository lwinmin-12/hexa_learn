import { AuthService } from './auth.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { FirebaseAdminService } from '../firebase-admin/firebase-admin.service.js';

describe('social login', () => {
  const db = { user: { findUnique: vi.fn(), create: vi.fn() } };
  const firebase = { verifyIdToken: vi.fn() };
  const service = new AuthService(
    db as unknown as PrismaService,
    firebase as unknown as FirebaseAdminService,
  );

  beforeEach(() => vi.resetAllMocks());

  it.each([
    ['google.com', 'google'],
    ['apple.com', 'apple'],
    ['facebook.com', 'facebook'],
  ])(
    'creates an account from verified %s claims',
    async (signInProvider, provider) => {
      firebase.verifyIdToken.mockResolvedValue({
        uid: 'firebase-user',
        firebase: { sign_in_provider: signInProvider },
      });
      db.user.findUnique.mockResolvedValue(null);
      db.user.create.mockImplementation(async ({ data }) => ({
        ...data,
        id: 'local-user',
        status: 'active',
        deletedAt: null,
      }));
      await expect(service.login('firebase-id-token')).resolves.toMatchObject({
        provider,
      });
      expect(firebase.verifyIdToken).toHaveBeenCalledWith('firebase-id-token');
      expect(db.user.create).toHaveBeenCalledWith({
        data: {
          firebaseUid: 'firebase-user',
          provider,
          email: null,
          displayName: null,
          avatarUrl: null,
        },
      });
    },
  );

  it.each(['password', 'anonymous', 'phone', 'custom', 'toString'])(
    'rejects unsupported provider %s',
    async (provider) => {
      firebase.verifyIdToken.mockResolvedValue({
        uid: 'user',
        firebase: { sign_in_provider: provider },
      });
      await expect(service.login('token')).rejects.toMatchObject({
        status: 400,
      });
      expect(db.user.findUnique).not.toHaveBeenCalled();
    },
  );

  it('does not access the database when token verification fails', async () => {
    firebase.verifyIdToken.mockRejectedValue(new Error('Invalid token'));
    await expect(service.login('invalid')).rejects.toThrow('Invalid token');
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});
