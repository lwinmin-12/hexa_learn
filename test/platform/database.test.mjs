import 'reflect-metadata';
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { Test } from '@nestjs/testing';
import { ConfigService, ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { SharedModule } from '../../dist/platform/shared.module.js';
import { AdminDashboardModule } from '../../dist/admin-dashboard/admin-dashboard.module.js';
import { AdminContentModule } from '../../dist/admin-content/admin-content.module.js';
import { AdminLearningToolsModule } from '../../dist/admin-learning-tools/admin-learning-tools.module.js';
import { AdminQuizzesModule } from '../../dist/admin-quizzes/admin-quizzes.module.js';
import { CertificatesModule } from '../../dist/certificates/certificates.module.js';
import { ChannelsModule } from '../../dist/channels/channels.module.js';
import { NotificationsModule } from '../../dist/notifications/notifications.module.js';
import { AdminChannelsModule } from '../../dist/admin-channels/admin-channels.module.js';
import { PaymentsModule } from '../../dist/payments/payments.module.js';
import { AdminPaymentsModule } from '../../dist/admin-payments/admin-payments.module.js';
import { QuizzesModule } from '../../dist/quizzes/quizzes.module.js';
import { CoursesModule } from '../../dist/courses/courses.module.js';
import { ProgressModule } from '../../dist/progress/progress.module.js';
import { ChaptersEpisodesModule } from '../../dist/chapters-episodes/chapters-episodes.module.js';
import { PrismaService } from '../../dist/prisma/prisma.service.js';
import { FirebaseAdminService } from '../../dist/firebase-admin/firebase-admin.service.js';
import { AccountDeletionService } from '../../dist/auth/account-deletion.service.js';
import { JobsService } from '../../dist/platform/jobs.service.js';
import { StorageService } from '../../dist/platform/storage.service.js';
import { createValidationPipe } from '../../dist/validation.js';
import { ApiErrorFilter } from '../../dist/platform/common.js';
const suite = process.env.RUN_DATABASE_TESTS === '1' ? describe : describe.skip;
suite('learning API with isolated PostgreSQL schema', () => {
  let app, db, client, learner, owner, course, chapter, episode;
  const schema = `learning_test_${randomUUID().replaceAll('-', '')}`;
  const headers = { Authorization: 'Bearer learner' };
  beforeAll(async () => {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const name of (await readdir('prisma/migrations'))
      .filter((n) => /^\d/.test(n))
      .sort())
      await client.query(
        await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8'),
      );
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set('schema', schema);
    db = new PrismaService(new ConfigService({ DATABASE_URL: url.toString() }));
    const mod = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        SharedModule,
        AdminDashboardModule,
        AdminContentModule,
        AdminLearningToolsModule,
        AdminQuizzesModule,
        CertificatesModule,
        ChannelsModule,
        NotificationsModule,
        AdminChannelsModule,
        PaymentsModule,
        AdminPaymentsModule,
        QuizzesModule,
        CoursesModule,
        ProgressModule,
        ChaptersEpisodesModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(FirebaseAdminService)
      .useValue({ verifyIdToken: async (token) => ({ uid: token }) })
      .overrideProvider(AccountDeletionService)
      .useValue({ flush: async () => {} })
      .overrideProvider(JobsService)
      .useValue({ add: async () => {} })
      .overrideProvider(StorageService)
      .useValue({
        get: async () => 'https://signed.example/video?signature=private',
        mediaUrl: async () => 'https://signed.example/media?signature=private',
        head: async () => ({}),
        put: async (_bucket, key) => key,
        putUrl: async () => 'https://signed.example/put',
        delete: async () => {},
      })
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
    owner = await db.user.create({
      data: {
        firebaseUid: 'owner',
        provider: 'google',
        role: 'page_admin',
        phoneVerifiedAt: new Date(),
      },
    });
    learner = await db.user.create({
      data: {
        firebaseUid: 'learner',
        provider: 'google',
        phoneVerifiedAt: new Date(),
      },
    });
    course = await db.course.create({
      data: {
        ownerId: owner.id,
        title: 'Published course',
        slug: 'published',
        status: 'published',
        channel: { create: { name: 'Course channel' } },
      },
    });
    chapter = await db.chapter.create({
      data: {
        courseId: course.id,
        title: 'Chapter',
        position: 1,
        status: 'published',
      },
    });
    episode = await db.episode.create({
      data: {
        chapterId: chapter.id,
        title: 'Episode',
        position: 1,
        status: 'published',
        videoUrl: 'private/key.mp4',
        videoDurationSec: 100,
        videoUploadStatus: 'ready',
      },
    });
  }, 30000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await client.end();
    }
  });
  const http = () => request(app.getHttpServer());
  it('admin episode playback and UTC scheduling persist through HTTP and PostgreSQL', async () => {
    const auth = { Authorization: 'Bearer owner' };
    const created = await db.episode.create({ data: {
      chapterId: chapter.id, title: 'Admin preview', position: 91,
    } });
    const path = `/api/v1/admin/episodes/${created.id}`;
    const pending = await http().get(path).set(auth).expect(200);
    expect(pending.body.playbackUrl).toBeNull();
    expect(pending.body).not.toHaveProperty('videoUrl');
    const publishAt = '2099-10-23T06:44:00.000Z';
    const scheduledAt = '2099-10-23T06:45:37.123Z';
    const patch = await http().patch(path).set(auth).send({ status: 'scheduled', publishAt, scheduledAt }).expect(200);
    expect(patch.body).toMatchObject({ publishAt, videoScheduledAt: scheduledAt });
    const saved = await db.episode.findUniqueOrThrow({ where: { id: created.id } });
    expect(saved.publishAt.toISOString()).toBe(publishAt);
    expect(saved.videoScheduledAt.toISOString()).toBe(scheduledAt);
    const storageKey = `courses/${course.id}/episodes/${created.id}/${randomUUID()}.mp4`;
    const confirmed = await http().post(`${path}/video`).set(auth).send({ storageKey, durationSec: 85 }).expect(201);
    expect(confirmed.body).toMatchObject({ publishAt, videoScheduledAt: scheduledAt, videoUploadStatus: 'ready', playbackUrl: expect.stringContaining('https://signed.example/') });
    expect(confirmed.body).not.toHaveProperty('videoUrl');
    const detail = await http().get(path).set(auth).expect(200);
    expect(detail.body).toMatchObject({ publishAt, videoScheduledAt: scheduledAt, playbackUrl: confirmed.body.playbackUrl });
    const content = await http().get(`/api/v1/admin/courses/${course.id}`).set(auth).expect(200);
    expect(content.body.chapters.flatMap((row) => row.episodes).find((row) => row.id === created.id)).toMatchObject({ playbackUrl: confirmed.body.playbackUrl });
    expect(JSON.stringify(content.body)).not.toContain('videoUrl');
    const clear = await http().patch(path).set(auth).send({ status: 'draft', publishAt: null, scheduledAt: null }).expect(200);
    expect(clear.body).toMatchObject({ publishAt: null, videoScheduledAt: null });
    for (const body of [{ publishAt: '2000-01-01T00:00:00.000Z' }, { scheduledAt: '2000-01-01T00:00:00.000Z' }]) {
      const rejected = await http().patch(path).set(auth).send(body).expect(400);
      expect(rejected.body.code).toBe('SCHEDULE_IN_PAST');
    }
    const noPublish = await http().patch(path).set(auth).send({ status: 'scheduled' }).expect(400);
    expect(noPublish.body.code).toBe('PUBLISH_AT_REQUIRED');
    await db.user.create({ data: { firebaseUid: 'preview-other-admin', provider: 'google', role: 'page_admin' } });
    await http().get(path).set('Authorization', 'Bearer preview-other-admin').expect(404);
    await db.user.create({ data: { firebaseUid: 'preview-super-admin', provider: 'google', role: 'super_admin' } });
    await http().get(path).set('Authorization', 'Bearer preview-super-admin').expect(200);
  });
  it('hides unpublished and future content', async () => {
    const draft = await db.course.create({
      data: { ownerId: owner.id, title: 'Draft', slug: 'draft' },
    });
    await http().get(`/api/v1/courses/${draft.id}`).set(headers).expect(404);
    const future = await db.episode.create({
      data: {
        chapterId: chapter.id,
        title: 'Future',
        position: 2,
        status: 'published',
        publishAt: new Date(Date.now() + 86400000),
      },
    });
    await http().get(`/api/v1/episodes/${future.id}`).set(headers).expect(404);
    const r = await http().get('/api/v1/courses').set(headers).expect(200);
    expect(r.body.data.map((c) => c.id)).not.toContain(draft.id);
  });
  it('omits the video for locked premium episodes', async () => {
    await db.course.update({
      where: { id: course.id },
      data: { isPremium: true, price: '20', currency: 'USD' },
    });
    const r = await http()
      .get(`/api/v1/episodes/${episode.id}`)
      .set(headers)
      .expect(200);
    expect(r.body.locked).toBe(true);
    expect(r.body.videoUrl).toBeUndefined();
    await db.course.update({
      where: { id: course.id },
      data: { isPremium: false, price: null, currency: null },
    });
  });
  it('enrolls idempotently and completes progress monotonically', async () => {
    await http()
      .post(`/api/v1/courses/${course.id}/enroll`)
      .set(headers)
      .expect(201);
    await http()
      .post(`/api/v1/courses/${course.id}/enroll`)
      .set(headers)
      .expect(201);
    await http()
      .put(`/api/v1/episodes/${episode.id}/progress`)
      .set(headers)
      .send({ watchedSec: 90 })
      .expect(200);
    const r = await http()
      .put(`/api/v1/episodes/${episode.id}/progress`)
      .set(headers)
      .send({ watchedSec: 1, isCompleted: false })
      .expect(200);
    expect(r.body.watchedSec).toBe(90);
    expect(r.body.isCompleted).toBe(true);
    const enrollment = await db.enrollment.findUnique({
      where: { userId_courseId: { userId: learner.id, courseId: course.id } },
    });
    expect(enrollment.status).toBe('completed');
    expect(Number(enrollment.progressPct)).toBe(100);
    const detail = await http()
      .get(`/api/v1/episodes/${episode.id}`)
      .set(headers)
      .expect(200);
    expect(detail.body.videoUrl).toContain('signature=');
  });
  it('grades multi-select, hides answers, and rejects a second submission', async () => {
    const quiz = await db.quiz.create({
      data: {
        courseId: course.id,
        title: 'Quiz',
        passScore: 2,
        questions: {
          create: {
            questionText: 'Choose both',
            position: 1,
            points: 2,
            options: {
              create: [
                { optionText: 'A', position: 1, isCorrect: true },
                { optionText: 'B', position: 2, isCorrect: true },
                { optionText: 'C', position: 3, isCorrect: false },
              ],
            },
          },
        },
      },
      include: { questions: { include: { options: true } } },
    });
    const detail = await http()
      .get(`/api/v1/quizzes/${quiz.id}`)
      .set(headers)
      .expect(200);
    expect(JSON.stringify(detail.body)).not.toContain('isCorrect');
    expect(JSON.stringify(detail.body)).not.toContain('explanation');
    const start = await http()
      .post(`/api/v1/quizzes/${quiz.id}/attempts`)
      .set(headers)
      .expect(201);
    await http()
      .get(`/api/v1/quiz-attempts/${start.body.id}`)
      .set(headers)
      .expect(409);
    const question = quiz.questions[0];
    const answer = {
      answers: [
        {
          questionId: question.id,
          optionIds: question.options
            .filter((o) => o.isCorrect)
            .map((o) => o.id),
        },
      ],
    };
    const result = await http()
      .post(`/api/v1/quiz-attempts/${start.body.id}/submit`)
      .set(headers)
      .send(answer)
      .expect(201);
    expect(result.body.score).toBe(2);
    expect(result.body.passed).toBe(true);
    await http()
      .post(`/api/v1/quiz-attempts/${start.body.id}/submit`)
      .set(headers)
      .send(answer)
      .expect(409);
    await http()
      .get(`/api/v1/quiz-attempts/${start.body.id}`)
      .set(headers)
      .expect(200);
  });

  it('approves atomically and rolls back when a promo is exhausted', async () => {
    const premium = await db.course.create({
      data: {
        ownerId: owner.id,
        title: 'Paid',
        slug: 'paid',
        isPremium: true,
        price: '100',
        currency: 'USD',
        status: 'published',
      },
    });
    const method = await db.paymentMethod.create({
      data: { type: 'bank_transfer', name: 'Bank' },
    });
    const promo = await db.promoCode.create({
      data: {
        code: 'ONLYONE',
        discountType: 'fixed',
        discountValue: '10',
        maxUses: 1,
        courseId: premium.id,
      },
    });
    const create = () =>
      http().post('/api/v1/payments').set(headers).send({
        courseId: premium.id,
        paymentMethodId: method.id,
        promoCode: promo.code,
      });
    const first = await create().expect(201),
      second = await create().expect(201);
    expect(first.body.finalAmount).toBe('90');
    await db.payment.updateMany({
      where: { id: { in: [first.body.id, second.body.id] } },
      data: { status: 'slip_uploaded', slipUrl: 'slip.jpg' },
    });
    await http()
      .post(`/api/v1/admin/payments/${first.body.id}/approve`)
      .set('Authorization', 'Bearer owner')
      .expect(201);
    await http()
      .post(`/api/v1/admin/payments/${second.body.id}/approve`)
      .set('Authorization', 'Bearer owner')
      .expect(409);
    expect(
      (await db.payment.findUnique({ where: { id: second.body.id } })).status,
    ).toBe('slip_uploaded');
    expect(
      (await db.promoCode.findUnique({ where: { id: promo.id } })).usedCount,
    ).toBe(1);
    expect(
      await db.enrollment.count({
        where: { courseId: premium.id, userId: learner.id },
      }),
    ).toBe(1);
    expect(
      await db.channelMember.count({
        where: { userId: learner.id, channel: { courseId: premium.id } },
      }),
    ).toBe(1);
  });

  it('restricts channel membership and notification ownership', async () => {
    const c = await db.channel.findUnique({ where: { courseId: course.id } });
    await http()
      .patch(`/api/v1/channels/${c.id}/mute`)
      .set(headers)
      .send({ isMuted: true })
      .expect(200);
    const m = await http()
      .post(`/api/v1/admin/channels/${c.id}/messages`)
      .set('Authorization', 'Bearer owner')
      .send({ title: 'Welcome', body: 'Start learning' })
      .expect(201);
    const n = await db.notification.create({
      data: { userId: learner.id, messageId: m.body.id },
    });
    const inbox = await http()
      .get('/api/v1/me/notifications?unread=true')
      .set(headers)
      .expect(200);
    expect(inbox.body.data[0].message.title).toBe('Welcome');
    await http()
      .patch(`/api/v1/me/notifications/${n.id}/read`)
      .set(headers)
      .expect(200);
    const count = await http()
      .get('/api/v1/me/notifications/unread-count')
      .set(headers)
      .expect(200);
    expect(count.body.count).toBe(0);
  });

  it('claims certificates idempotently and verifies without disclosing contact data', async () => {
    const first = await http()
      .post(`/api/v1/courses/${course.id}/certificate`)
      .set(headers)
      .expect(201);
    const second = await http()
      .post(`/api/v1/courses/${course.id}/certificate`)
      .set(headers)
      .expect(201);
    expect(second.body.id).toBe(first.body.id);
    const publicResult = await http()
      .get(`/api/v1/certificates/verify/${first.body.certificateNo}`)
      .expect(200);
    expect(Object.keys(publicResult.body).sort()).toEqual([
      'courseTitle',
      'issuedAt',
      'learnerDisplayName',
      'valid',
    ]);
  });

  it('hides foreign admin course and descendant resources', async () => {
    await db.user.create({
      data: {
        firebaseUid: 'other-admin',
        provider: 'google',
        role: 'page_admin',
        phoneVerifiedAt: new Date(),
      },
    });
    await http()
      .get(`/api/v1/admin/courses/${course.id}`)
      .set('Authorization', 'Bearer other-admin')
      .expect(404);
    await http()
      .patch(`/api/v1/admin/episodes/${episode.id}`)
      .set('Authorization', 'Bearer other-admin')
      .send({ title: 'Steal' })
      .expect(404);
    await http()
      .get(`/api/v1/admin/chapters/${chapter.id}/flashcards`)
      .set('Authorization', 'Bearer other-admin')
      .expect(404);
  });
  it('creates course plus channel and reorders unique siblings safely', async () => {
    const created = await http()
      .post('/api/v1/admin/courses')
      .set('Authorization', 'Bearer owner')
      .send({
        title: 'Admin course',
        isPremium: false,
        price: '100',
        currency: 'USD',
      })
      .expect(201);
    expect(created.body.price).toBeNull();
    expect(
      await db.channel.count({ where: { courseId: created.body.id } }),
    ).toBe(1);
    const a = await http()
      .post(`/api/v1/admin/courses/${created.body.id}/chapters`)
      .set('Authorization', 'Bearer owner')
      .send({ title: 'A' })
      .expect(201);
    const b = await http()
      .post(`/api/v1/admin/courses/${created.body.id}/chapters`)
      .set('Authorization', 'Bearer owner')
      .send({ title: 'B' })
      .expect(201);
    await http()
      .put(`/api/v1/admin/courses/${created.body.id}/chapters/reorder`)
      .set('Authorization', 'Bearer owner')
      .send({ ids: [b.body.id, a.body.id] })
      .expect(200);
    const rows = await db.chapter.findMany({
      where: { courseId: created.body.id },
      orderBy: { position: 'asc' },
    });
    expect(rows.map((r) => r.id)).toEqual([b.body.id, a.body.id]);
    await http()
      .put(`/api/v1/admin/courses/${created.body.id}/chapters/reorder`)
      .set('Authorization', 'Bearer owner')
      .send({ ids: [a.body.id] })
      .expect(400);
  });
  it('validates quiz parents and checks video key ownership', async () => {
    await http()
      .post('/api/v1/admin/quizzes')
      .set('Authorization', 'Bearer owner')
      .send({
        title: 'Invalid',
        passScore: 1,
        courseId: course.id,
        chapterId: chapter.id,
      })
      .expect(400);
    await http()
      .post(`/api/v1/admin/episodes/${episode.id}/video`)
      .set('Authorization', 'Bearer owner')
      .send({ storageKey: 'another-course/video.mp4', durationSec: 20 })
      .expect(400);
  });

  it('scopes dashboard metrics to the page admin and validates revenue dates', async () => {
    const other = await http()
      .get('/api/v1/admin/dashboard/summary')
      .set('Authorization', 'Bearer other-admin')
      .expect(200);
    expect(other.body.totalCourses).toBe(0);
    expect(other.body.totalRevenue).toBe('0');
    const own = await http()
      .get('/api/v1/admin/dashboard/summary')
      .set('Authorization', 'Bearer owner')
      .expect(200);
    expect(own.body.totalCourses).toBeGreaterThan(0);
    expect(own.body.totalRevenue).toBe('90');
    await http()
      .get('/api/v1/admin/dashboard/revenue?from=2020-01-01&to=2026-01-01')
      .set('Authorization', 'Bearer owner')
      .expect(400);
    await http()
      .get(`/api/v1/admin/courses/${course.id}/stats`)
      .set('Authorization', 'Bearer other-admin')
      .expect(404);
  });
  it('accepts multipart cover/audio/slip uploads and confirms a signed video', async () => {
    const auth = { Authorization: 'Bearer owner' };
    const image = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY9sAAAAASUVORK5CYII=',
      'base64',
    );
    const cover = await http()
      .post(`/api/v1/admin/courses/${course.id}/cover`)
      .set(auth)
      .attach('file', image, {
        filename: 'cover.png',
        contentType: 'image/png',
      })
      .expect(201);
    expect(cover.body.coverUrl).toContain('signature=');
    const detail = await http()
      .get(`/api/v1/admin/courses/${course.id}`)
      .set(auth)
      .expect(200);
    expect(detail.body.coverUrl).toContain('signature=');
    await http()
      .post(`/api/v1/admin/chapters/${chapter.id}/audio`)
      .set(auth)
      .field('title', 'Vocabulary')
      .field('type', 'vocab')
      .attach('file', Buffer.from('ID3test audio'), {
        filename: 'audio.mp3',
        contentType: 'audio/mpeg',
      })
      .expect(201);
    const url = await http()
      .post(`/api/v1/admin/episodes/${episode.id}/video/upload-url`)
      .set(auth)
      .send({ ext: 'mp4' })
      .expect(201);
    expect(url.body.headers).toEqual({ 'Content-Type': 'video/mp4' });
    expect(url.body.storageKey).toBe(url.body.key);
    await http()
      .post(`/api/v1/admin/episodes/${episode.id}/video`)
      .set(auth)
      .send({ storageKey: url.body.key, durationSec: 100 })
      .expect(201);
    const pending = await db.payment.findFirst({
      where: { userId: learner.id, status: 'slip_uploaded' },
    });
    await db.payment.update({
      where: { id: pending.id },
      data: { status: 'rejected' },
    });
    await http()
      .post(`/api/v1/payments/${pending.id}/slip`)
      .set(headers)
      .attach('file', image, { filename: 'slip.png', contentType: 'image/png' })
      .expect(201);
  });
  it('creates flashcards without audio and clears existing audio with a blank value', async () => {
    const auth = { Authorization: 'Bearer owner' };
    const card = await http()
      .post(`/api/v1/admin/chapters/${chapter.id}/flashcards`)
      .set(auth)
      .send({ frontText: 'Hello', backText: 'Bonjour' })
      .expect(201);
    expect(card.body.audioUrl).toBeNull();
    await http()
      .patch(`/api/v1/admin/flashcards/${card.body.id}`)
      .set(auth)
      .send({ audioUrl: 'https://example.com/audio.mp3' })
      .expect(200);
    const cleared = await http()
      .patch(`/api/v1/admin/flashcards/${card.body.id}`)
      .set(auth)
      .send({ audioUrl: '' })
      .expect(200);
    expect(cleared.body.audioUrl).toBeNull();
  });
});
