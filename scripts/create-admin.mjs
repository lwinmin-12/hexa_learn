import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_NAME?.trim() || 'Administrator';
const role = process.env.ADMIN_ROLE || 'page_admin';

console.log(email, password, displayName, role);
if (
  !email ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  !password ||
  password.length < 12 ||
  !['super_admin', 'page_admin'].includes(role)
) {
  throw new Error(
    'Set ADMIN_EMAIL, ADMIN_PASSWORD (at least 12 characters), and ADMIN_ROLE (super_admin or page_admin).',
  );
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');
const schema = new URL(connectionString).searchParams.get('schema') || 'public';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString }, { schema }),
});
const credentials = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  ? JSON.parse(
      Buffer.from(
        process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
        'base64',
      ).toString('utf8'),
    )
  : null;
const projectId = credentials?.project_id || process.env.FIREBASE_PROJECT_ID;
const clientEmail =
  credentials?.client_email || process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = credentials?.private_key || process.env.FIREBASE_PRIVATE_KEY;
if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
if (Boolean(clientEmail) !== Boolean(privateKey))
  throw new Error(
    'Firebase client email and private key must be configured together',
  );
const app = initializeApp({
  projectId,
  credential:
    clientEmail && privateKey
      ? cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replaceAll('\\n', '\n'),
        })
      : applicationDefault(),
});
const auth = getAuth(app);
let createdUid;
try {
  if (
    await db.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    })
  ) {
    throw new Error(
      'An account with this email already exists. This command only creates new admins.',
    );
  }
  const firebaseUser = await auth.createUser({ email, password, displayName });
  createdUid = firebaseUser.uid;
  const user = await db.user.create({
    data: {
      firebaseUid: createdUid,
      email,
      displayName,
      provider: 'password',
      role,
    },
  });
  createdUid = undefined;
  console.info(
    `Created ${user.role} account ${user.email}. Sign in through the dashboard with the supplied password.`,
  );
} catch (error) {
  if (createdUid) await auth.deleteUser(createdUid);
  throw error;
} finally {
  await db.$disconnect();
}
