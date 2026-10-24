<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

### Run the full stack with Docker

Copy `.env.example` to `.env` if needed and fill in your Firebase credentials.
For Docker, use `FIREBASE_SERVICE_ACCOUNT_BASE64` or the project ID, client email,
and private key fields. A host `GOOGLE_APPLICATION_CREDENTIALS` path is not
available inside the container; remove that setting when using inline credentials.
Keep the S3 access/secret keys aligned with the MinIO root credentials.

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

The API is available at `http://localhost:3000/api/v1` and docs at
`http://localhost:3000/docs` (or your configured `PORT`). The setup service
applies committed Prisma migrations and creates the storage buckets before the
API starts. PostgreSQL, Redis, and MinIO data persist in named volumes.
`docker compose down` stops the stack while preserving that data.

Compose overrides host database, Redis, and S3 connection addresses with service
names. `S3_PUBLIC_URL` is used to sign browser-facing URLs; keep it as
`http://localhost:9000` locally or set it to a storage address your clients can
reach. Internal storage requests use `http://minio:9000`.

After schema or source changes, run `docker compose up -d --build` again.
The first build needs internet access to download Node dependencies and compile
MinIO. For infrastructure only, run `docker compose up -d db redis minio`.

### API documentation

After starting the server, open [Scalar API docs](http://localhost:3000/docs).
The Swagger-generated OpenAPI document is available at
[openapi.json](http://localhost:3000/openapi.json). Use your configured `PORT`
if it differs from 3000. For `/me` endpoints, paste a Firebase ID token into
Scalar's bearer authentication field.

### Local MinIO storage

Copy `.env.example` to `.env` if you do not already have one, then set
`MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` (at least 8 characters).
Keep `S3_ACCESS_KEY` and `S3_SECRET_KEY` aligned with these credentials.

```bash
docker compose up -d --build minio
docker compose ps minio
```

The S3 endpoint is `http://localhost:9000`. Open the MinIO console at
`http://localhost:9001` and sign in with the credentials from `.env`.
Data persists in the `miniodata` Docker volume.

Set `S3_ENDPOINT=http://localhost:9000` and `S3_FORCE_PATH_STYLE=true` in `.env`,
then run `npm run storage:init` to ensure the media, video, and payment-slip
buckets exist. Restart the API after changing environment variables. The endpoint
must also be reachable by the browser using signed URLs; use your reachable
storage hostname when testing from another device.

Image, audio, and payment-slip uploads use `multipart/form-data` with the file
field named `file`. Let the browser set the multipart boundary automatically.
Video uploads use three steps:

1. POST `/api/v1/admin/episodes/:id/video/upload-url` with `{"ext":"mp4"}`.
2. PUT the raw file bytes to the returned `uploadUrl`, using the returned
   `headers` exactly. Do not attach the API's Firebase bearer token to this PUT.
3. POST `/api/v1/admin/episodes/:id/video` with the returned `storageKey` and
   the video's `durationSec`.

Signed media URLs expire after one hour; fetch the API resource again to refresh
them. For flashcards, `audioUrl` is optional: omitting it on update preserves the
current value, while `null` or a blank string clears it.

GET `/api/v1/admin/episodes/:id` and the episodes nested in GET
`/api/v1/admin/courses/:id` return `playbackUrl`. Ready videos receive a signed
GET URL valid for one hour, including future scheduled videos for admin preview.
Episode responses omit the stored `videoUrl` key. The upload handshake still
returns `storageKey` for upload confirmation.

Episode PATCH and video confirmation accept nullable UTC `publishAt` and
`scheduledAt`, such as `2026-10-23T06:44:00.000Z`. Omitted fields preserve
their value. `scheduledAt` updates `videoScheduledAt`. `publishAt` controls
episode publication; `videoScheduledAt` independently controls learner playback.
New schedules older than 60 seconds return `SCHEDULE_IN_PAST`. Scheduled
episodes require `publishAt`. The publisher runs every minute in UTC.

Storage CORS uses `S3_CORS_ORIGINS`, falling back to `DASHBOARD_ORIGINS`.
Set this comma-separated list to your admin web origins and run
`npm run storage:init`. The rule allows GET, HEAD, PUT and all request headers,
including Range. It exposes ETag, Accept-Ranges, Content-Range, and Content-Length
for 3600 seconds. Compose also sets MinIO's `MINIO_API_CORS_ALLOW_ORIGIN`.
Recreate MinIO after changing that setting.

The existing schedule columns are `timestamp(3)` without a time zone. The API
preserves UTC instants and milliseconds, but native `timestamptz` needs a future
Prisma `@db.Timestamptz(3)` change and a migration interpreting existing values
as UTC. This change does not alter the Prisma schema or database types.

Run `RUN_STORAGE_TESTS=1 npm run test:platform` after building to verify storage
uploads, signed downloads, and browser preflight. These checks clean up their
temporary files afterward.

MinIO is built from the pinned source release in `docker/minio/Dockerfile` because
the former prebuilt image is unavailable. The first build requires internet
access and can take several minutes.

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Japanese learning demo data

Migration `20261017000000_japanese_learning_demo` adds three free, published
courses covering kana, JLPT N5 grammar, and everyday conversation. It includes
6 chapters, 12 published lessons with text descriptions, 36 Japanese/English
flashcards, and 6 chapter quizzes with 12 questions and 48 answer options.
Each question has exactly one correct answer and awards one point. Each quiz
requires both answers to be correct to reach its two-point pass score.

The migration also adds one demo teacher with the `page_admin` role, two demo
learners, 4 active enrollments with zero progress, 3 course channels,
7 channel memberships, 3 messages, and 4 unread notifications.
The accounts use `example.com` email addresses and dummy Firebase UIDs.
They do not create Firebase users or provide login credentials. Use your own
Firebase account to access authenticated endpoints.

No media assets are included. Lessons have no playable video, and flashcards
have no audio. Upload real media through the admin API before testing playback.
No payments, bank details, quiz attempts, certificates, or completed progress
are inserted.

Run `npm run db:migrate` to apply pending migrations to the configured database.
Docker's setup service also applies this migration during
`docker compose up -d --build`. Prisma records it once; subsequent runs keep
existing data. PostgreSQL generates every demo ID with `gen_random_uuid()` during the migration.
The migration reuses those IDs for related rows. The inserts run in one
transaction and fail on unique-key collisions instead of overwriting records.

This is a committed data migration, so it also inserts the demo content and
accounts in production databases when deployed. Review that impact before
running migrations against production.

## Firebase authentication and profile API

Set `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, and
`GOOGLE_APPLICATION_CREDENTIALS` using `.env.example`. The credentials path must
point to a Firebase service account JSON on the API host. Google Application
Default Credentials also work on supported hosting. Never commit the JSON file.

`src/firebase-admin` owns Firebase Admin initialization and token verification.
You can alternatively configure `FIREBASE_SERVICE_ACCOUNT_BASE64` with the
base64-encoded service account JSON, or set `FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` together. Escaped `\n` in the
private key is supported. These credentials belong on the API server only.

In Firebase Console → Authentication → Sign-in method, configure all three:

- [Google](https://firebase.google.com/docs/auth/web/google-signin): enable Google and select a support email.
- [Apple](https://firebase.google.com/docs/auth/web/apple): configure Sign in with Apple in your Apple developer account and enter its provider configuration in Firebase.
- [Facebook](https://firebase.google.com/docs/auth/web/facebook-login): enter the Meta app ID and secret in Firebase and add Firebase's OAuth redirect URI to the Meta app.

Add your frontend domain under Firebase Authentication's authorized domains.
Provider credentials are configured in Firebase; the API accepts the resulting
Firebase ID token for all three providers through the same `/auth/login` route.
It derives the provider from verified claims and rejects unsupported login providers.

Example frontend flow after initializing the Firebase client SDK:

```ts
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, OAuthProvider, signInWithPopup } from 'firebase/auth';

const providers = {
  google: new GoogleAuthProvider(),
  apple: new OAuthProvider('apple.com'),
  facebook: new FacebookAuthProvider(),
};
const result = await signInWithPopup(getAuth(), providers.google); // or apple / facebook
const idToken = await result.user.getIdToken();
const response = await fetch('/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idToken }),
});
if (!response.ok) throw new Error('API login failed');
const profile = await response.json();
```

The example assumes the frontend proxies API requests to this backend.
Send the Firebase ID token, rather than a raw Google/Apple token or Facebook access token.
The phone OTP controller routes below are currently commented out; their service
implementation is retained, but those endpoints are not exposed.

Enable Google, Apple, and/or Facebook sign-in and the Phone provider in the same
Firebase project. Configure authorized frontend domains, SMS regions, and billing
as required by Firebase. Phone endpoints currently accept the web reCAPTCHA proof;
native Play Integrity/APNs and reCAPTCHA Enterprise payloads are not implemented.

```bash
npm install
npm run prisma:generate
npm run db:migrate
npm run start:dev
```

Sign in with the Firebase client SDK and send its **ID token** to `/auth/login`.
All other routes below require `Authorization: Bearer <Firebase ID token>` for
any active user role. Expired, revoked, and disabled-user tokens are rejected.
The API uses Firebase tokens directly and does not issue another JWT.

| Method | Route | JSON body | Success |
| --- | --- | --- | --- |
| POST | `/auth/login` | `{ "idToken": "..." }` | 200, profile; creates a learner on first social login |
| POST | `/auth/phone/send-otp` | `{ "phone": "+84912345678", "recaptchaToken": "..." }` | 200, `{ verificationId, expiresIn, resendAfter }` |
| POST | `/auth/phone/verify-otp` | `{ "verificationId": "uuid-from-send", "code": "123456" }` | 200, profile with `phoneVerifiedAt` |
| GET | `/me` | — | 200, profile |
| PATCH | `/me` | `{ "displayName": "Your name", "avatarUrl": "https://..." }` | 200, profile; either field can be omitted or cleared with `null` |
| DELETE | `/me` | — | 202, `{ status: "deleted", firebaseDeletion: "queued" }` |
| POST | `/me/device-tokens` | `{ "token": "FCM token", "platform": "ios" }` | 201, `{ id, platform, updatedAt }`; platform is `ios`, `android`, or `web` |
| DELETE | `/me/device-tokens/:token` | — | 204; URL-encode the token |

The reCAPTCHA token comes from Firebase's client-side app verification flow.
Firebase sends and verifies the SMS; the API stores a user-bound verification
challenge with a five-minute expiry, a 60-second resend cooldown, and a maximum
of five verification attempts. A failed SMS send still consumes the cooldown.
Verification links the phone to the current Firebase account. Refresh the client
ID token after linking so its claims reflect the linked phone. Local profile
edits are stored in PostgreSQL and are not overwritten by later Firebase logins.

Account deletion requires sign-in within the last five minutes (`auth_time`);
refreshing an old session does not satisfy this requirement. It clears profile
personal data, device tokens, and OTP challenges and immediately blocks API
access. Courses, payments, learning history, and a Firebase UID tombstone remain.
The tombstone prevents accidental account recreation during a Firebase outage.
Firebase account deletion runs immediately in the background and retries every
60 seconds and after API restarts; keep an API instance running for cleanup.

Device registration is idempotent. A token registered by another signed-in user
is reassigned to that user, supporting shared-device sign-in. Removal is limited
to tokens belonging to the current user. Extra request fields are rejected,
including attempts to change `role`, `status`, or `phoneVerifiedAt`.

Errors use Nest's standard `{ statusCode, message, error }` response: 400 for bad
input/OTP, 401 for authentication, 403 for suspended accounts, 409 for phone
conflicts, 429 for OTP limits, and 503 for Firebase configuration/outages.

References: [Firebase token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[SMS sending](https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/sendVerificationCode),
[phone linking](https://cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signInWithPhoneNumber).

## Run tests

`npm test` runs unit tests. `npm run test:e2e` compiles the app and checks HTTP
contracts with mocked Firebase. To also verify migrations, persistence, OTP
limits, and deletion against PostgreSQL:

```bash
RUN_DATABASE_TESTS=1 npm run test:e2e
```

This creates a uniquely named test schema in the configured database and removes
only that schema afterward. The database role needs schema creation privileges.
Firebase is mocked in tests; no real SMS is sent or Firebase user deleted.

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Admin dashboard login

Follow [Run the admin dashboard with the API](../ADMIN_SETUP.md) to enable email-and-password login and create admin accounts with `npm run admin:create`.
