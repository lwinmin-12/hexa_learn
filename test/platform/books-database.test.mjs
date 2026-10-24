import 'reflect-metadata';
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import pg from 'pg';
import { Test } from '@nestjs/testing';
import { ConfigService, ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { SharedModule } from '../../dist/platform/shared.module.js';
import { BooksModule } from '../../dist/books/books.module.js';
import { BooksService } from '../../dist/books/books.service.js';
import { AdminContentModule } from '../../dist/admin-content/admin-content.module.js';
import { CoursesModule } from '../../dist/courses/courses.module.js';
import { ChaptersEpisodesModule } from '../../dist/chapters-episodes/chapters-episodes.module.js';
import { PrismaService } from '../../dist/prisma/prisma.service.js';
import { FirebaseAdminService } from '../../dist/firebase-admin/firebase-admin.service.js';
import { AccountDeletionService } from '../../dist/auth/account-deletion.service.js';
import { JobsService } from '../../dist/platform/jobs.service.js';
import { StorageService } from '../../dist/platform/storage.service.js';
import { createValidationPipe } from '../../dist/validation.js';
import { ApiErrorFilter } from '../../dist/platform/common.js';

const suite = process.env.RUN_DATABASE_TESTS === '1' ? describe : describe.skip;
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
suite('books through HTTP and isolated PostgreSQL', () => {
  let app, db, client, owner, learner, course, chapter, service;
  const schema = `books_test_${randomUUID().replaceAll('-', '')}`;
  const uploaded = [], deleted = [], jobs = [], signed = [];
  const auth = (uid = 'book-owner') => ({ Authorization: `Bearer ${uid}` });
  const previousMax = process.env.BOOK_MAX_MB;
  const tempFiles = async () => (await readdir(tmpdir())).filter((name) => name.startsWith('hexa-book-')).sort();
  const http = () => request(app.getHttpServer());
  const upload = (parent, fields = {}, bytes = pdf, name = 'practice.pdf', mime = 'application/pdf', uid) => {
    let req = http().post(`/api/v1/admin/${parent}/books`).set(auth(uid));
    for (const [key, value] of Object.entries({ title: 'Hiragana Practice', ...fields })) req = req.field(key, value);
    return req.attach('file', bytes, { filename: name, contentType: mime });
  };
  const noKey = (body) => expect(JSON.stringify(body)).not.toContain('fileKey');
  const storedBook = (data = {}) => db.book.create({ data: {
    courseId: course.id, title: 'Fixture book', fileKey: `books/${course.id}/${randomUUID()}.pdf`,
    fileName: 'fixture.pdf', mimeType: 'application/pdf', sizeBytes: 123n,
    position: 50, status: 'published', ...data,
  } });
  beforeAll(async () => {
    process.env.BOOK_MAX_MB = '0.01';
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const name of (await readdir('prisma/migrations')).filter((name) => /^\d/.test(name)).sort())
      await client.query(await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8'));
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set('schema', schema);
    db = new PrismaService(new ConfigService({ DATABASE_URL: url.toString() }));
    const mod = await Test.createTestingModule({ imports: [
      ConfigModule.forRoot({ isGlobal: true }), SharedModule, BooksModule,
      AdminContentModule, CoursesModule, ChaptersEpisodesModule,
    ] })
      .overrideProvider(PrismaService).useValue(db)
      .overrideProvider(FirebaseAdminService).useValue({ verifyIdToken: async (token) => ({ uid: token }) })
      .overrideProvider(AccountDeletionService).useValue({ flush: async () => {} })
      .overrideProvider(JobsService).useValue({ add: async (...args) => jobs.push(args) })
      .overrideProvider(StorageService).useValue({
        putFile: async (bucket, key, path, mime) => {
          await access(path);
          let bytes = 0;
          for await (const chunk of createReadStream(path)) bytes += chunk.length;
          uploaded.push({ bucket, key, path, mime, bytes });
          return key;
        },
        delete: async (bucket, key) => deleted.push({ bucket, key }),
        get: async (...args) => { signed.push(args); return 'https://signed.example/book?signature=private'; },
        mediaUrl: async () => null,
      }).compile();
    service = mod.get(BooksService);
    app = mod.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new ApiErrorFilter());
    await app.init();
    const user = (firebaseUid, role = 'learner', verified = true) => db.user.create({ data: {
      firebaseUid, provider: 'google', role, phoneVerifiedAt: verified ? new Date() : null,
    } });
    owner = await user('book-owner', 'page_admin');
    learner = await user('book-learner');
    await user('book-stranger', 'page_admin');
    await user('book-super', 'super_admin');
    await user('book-unverified', 'learner', false);
    course = await db.course.create({ data: { ownerId: owner.id, title: 'Japanese', slug: 'books-course', status: 'published' } });
    chapter = await db.chapter.create({ data: { courseId: course.id, title: 'Hiragana', position: 1, status: 'published' } });
  }, 30000);
  afterAll(async () => {
    if (previousMax === undefined) delete process.env.BOOK_MAX_MB;
    else process.env.BOOK_MAX_MB = previousMax;
    await app?.close();
    await db?.$disconnect();
    if (client) { await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await client.end(); }
  });

  it('streams valid multipart PDFs, parses false/true, increments sibling positions, and cleans disk files', async () => {
    const before = await tempFiles();
    const first = await upload(`courses/${course.id}`, { title: '  Hiragana Practice  ', description: 'Japanese practice sheets', canView: 'false', canDownload: 'true', status: 'published' }).expect(201);
    expect(first.body).toMatchObject({ title: 'Hiragana Practice', canView: false, canDownload: true, position: 1, scope: 'course', sizeBytes: String(pdf.length), attachedTo: { type: 'course', id: course.id, title: course.title } });
    const second = await upload(`courses/${course.id}`).expect(201);
    expect(second.body).toMatchObject({ canView: true, canDownload: false, status: 'draft', position: 2 });
    const child = await upload(`chapters/${chapter.id}`, { canView: 'true', canDownload: 'false' }).expect(201);
    expect(child.body).toMatchObject({ scope: 'chapter', position: 1, attachedTo: { id: chapter.id } });
    const saved = await db.book.findUniqueOrThrow({ where: { id: first.body.id } });
    expect(saved.fileKey).toMatch(new RegExp(`^books/${course.id}/[a-f0-9-]+\\.pdf$`));
    expect(uploaded.at(-1)).toMatchObject({ bucket: 'BOOKS', bytes: pdf.length, mime: 'application/pdf' });
    expect(await tempFiles()).toEqual(before);
    for (const response of [first, second, child]) noKey(response.body);
  });

  it('rejects invalid text, permissions, PDFs, and oversized uploads before storage and cleans temp files', async () => {
    const beforeFiles = await tempFiles(), beforeUploads = uploaded.length, beforeRows = await db.book.count();
    const badText = await upload(`courses/${course.id}`, { title: 'x' }).expect(400);
    expect(badText.body.code).toBe('VALIDATION_ERROR');
    await upload(`courses/${course.id}`, { canView: 'no' }).expect(400);
    const noMode = await upload(`courses/${course.id}`, { status: 'published', canView: 'false', canDownload: 'false' }).expect(400);
    expect(noMode.body.code).toBe('BOOK_NO_ACCESS_MODE');
    for (const [bytes, name, mime] of [[pdf, 'book.txt', 'application/pdf'], [pdf, 'book.pdf', 'text/plain'], [Buffer.from('not a pdf'), 'book.pdf', 'application/pdf']]) {
      const result = await upload(`courses/${course.id}`, {}, bytes, name, mime).expect(400);
      expect(result.body.code).toBe('BOOK_INVALID_FILE');
    }
    const tooLarge = await upload(`courses/${course.id}`, {}, Buffer.concat([pdf, Buffer.alloc(11000)])).expect(413);
    expect(tooLarge.body.code).toBe('BOOK_TOO_LARGE');
    await http().post(`/api/v1/admin/courses/${course.id}/books`).set(auth()).field('title', 'No file').expect(400);
    expect(uploaded).toHaveLength(beforeUploads);
    expect(await db.book.count()).toBe(beforeRows);
    expect(await tempFiles()).toEqual(beforeFiles);
  });

  it('hides foreign parents and book operations from page admins while allowing super admins', async () => {
    const beforeFiles = await tempFiles(), beforeUploads = uploaded.length;
    const book = await storedBook();
    for (const parent of [`courses/${course.id}`, `chapters/${chapter.id}`])
      await upload(parent, {}, pdf, 'book.pdf', 'application/pdf', 'book-stranger').expect(404);
    for (const [method, path, body] of [
      ['get', `admin/courses/${course.id}/books`], ['get', `admin/books/${book.id}`],
      ['patch', `admin/books/${book.id}`, { title: 'Stolen' }], ['delete', `admin/books/${book.id}`],
      ['put', `admin/chapters/${chapter.id}/books/reorder`, { ids: [] }],
    ]) await http()[method](`/api/v1/${path}`).set(auth('book-stranger')).send(body).expect(404);
    await http().put(`/api/v1/admin/books/${book.id}/file`).set(auth('book-stranger')).attach('file', pdf, 'book.pdf').expect(404);
    await http().get(`/api/v1/admin/books/${book.id}`).set(auth('book-super')).expect(200);
    await http().get(`/api/v1/admin/books/${book.id}`).set(auth('book-learner')).expect(403);
    expect(uploaded).toHaveLength(beforeUploads);
    expect(await tempFiles()).toEqual(beforeFiles);
  });

  it('enforces exactly one parent in service and PostgreSQL', async () => {
    for (const parent of [{}, { courseId: course.id, chapterId: chapter.id }]) {
      await expect(service.create(owner, parent, { title: 'Invalid parents' }, undefined)).rejects.toMatchObject({ response: { code: 'BOOK_ONE_PARENT_REQUIRED' } });
      await expect(storedBook({ courseId: null, ...parent })).rejects.toThrow(/books_one_parent/);
    }
  });

  it('supports single-field PATCH and checks the final access flags', async () => {
    const book = await storedBook({ canView: true, canDownload: false });
    const path = `/api/v1/admin/books/${book.id}`;
    const rejected = await http().patch(path).set(auth()).send({ canView: false }).expect(400);
    expect(rejected.body.code).toBe('BOOK_NO_ACCESS_MODE');
    await http().patch(path).set(auth()).send({ canDownload: true }).expect(200);
    const changed = await http().patch(path).set(auth()).send({ canView: false }).expect(200);
    expect(changed.body).toMatchObject({ canView: false, canDownload: true, title: book.title });
    noKey(changed.body);
    await http().patch(path).set(auth()).send({ description: 'Practice every day' }).expect(200);
    await http().patch(path).set(auth()).send({ status: 'scheduled' }).expect(400);
    const detail = await http().get(path).set(auth()).expect(200);
    expect(detail.body.previewUrl).toContain('signature=');
    expect(signed.at(-1)[2]).toMatchObject({ expiresIn: 3600, contentType: 'application/pdf', contentDisposition: expect.stringMatching(/^inline;/) });
    noKey(detail.body);
  });

  it('replaces and deletes PDFs through queued cleanup; failed inserts and replacements compensate new storage', async () => {
    const book = await storedBook();
    const replacement = await http().put(`/api/v1/admin/books/${book.id}/file`).set(auth()).attach('file', pdf, { filename: 'replacement.pdf', contentType: 'application/pdf' }).expect(200);
    const saved = await db.book.findUniqueOrThrow({ where: { id: book.id } });
    expect(saved.fileKey).not.toBe(book.fileKey);
    expect(jobs.at(-1)).toEqual(['storage-cleanup', { objects: [{ bucket: 'BOOKS', key: book.fileKey }] }]);
    noKey(replacement.body);
    const beforeRows = await db.book.count();
    for (const method of ['create', 'replace']) {
      const transaction = jest.spyOn(db, '$transaction').mockRejectedValueOnce(new Error('simulated database write failure'));
      try {
        if (method === 'create') await upload(`courses/${course.id}`).expect(500);
        else await http().put(`/api/v1/admin/books/${book.id}/file`).set(auth()).attach('file', pdf, { filename: 'failed.pdf', contentType: 'application/pdf' }).expect(500);
      } finally { transaction.mockRestore(); }
      expect(deleted.at(-1)).toEqual({ bucket: 'BOOKS', key: uploaded.at(-1).key });
    }
    expect(await db.book.count()).toBe(beforeRows);
    expect((await db.book.findUniqueOrThrow({ where: { id: book.id } })).fileKey).toBe(saved.fileKey);
    const removed = await http().delete(`/api/v1/admin/books/${book.id}`).set(auth()).expect(200);
    expect(removed.body).toEqual({ deleted: true });
    expect(await db.book.findUnique({ where: { id: book.id } })).toBeNull();
    expect(jobs.at(-1)).toEqual(['storage-cleanup', { objects: [{ bucket: 'BOOKS', key: saved.fileKey }] }]);
  });

  it('filters and paginates admin books and reorders exact siblings', async () => {
    const parent = await db.course.create({ data: { ownerId: owner.id, title: 'Reorder', slug: 'books-reorder' } });
    const child = await db.chapter.create({ data: { courseId: parent.id, title: 'Child', position: 1 } });
    const a = await storedBook({ courseId: parent.id, title: 'Kana one', position: 1 });
    const b = await storedBook({ courseId: parent.id, title: 'Kana two', position: 2 });
    const c = await storedBook({ courseId: null, chapterId: child.id, title: 'Kanji', position: 1 });
    const path = `/api/v1/admin/courses/${parent.id}/books`;
    const all = await http().get(`${path}?page=2&limit=1`).set(auth()).expect(200);
    expect(all.body.meta).toEqual({ page: 2, limit: 1, total: 3 });
    expect(all.body.data).toHaveLength(1);
    const courseOnly = await http().get(`${path}?scope=course&search=KANA`).set(auth()).expect(200);
    expect(courseOnly.body.data.map((row) => row.id).sort()).toEqual([a.id, b.id].sort());
    const chapterOnly = await http().get(`${path}?scope=chapter&chapterId=${child.id}`).set(auth()).expect(200);
    expect(chapterOnly.body.data.map((row) => row.id)).toEqual([c.id]);
    await http().get(`${path}?chapterId=${chapter.id}`).set(auth()).expect(404);
    await http().put(`${path}/reorder`).set(auth()).send({ ids: [b.id, a.id] }).expect(200);
    expect((await db.book.findMany({ where: { courseId: parent.id }, orderBy: { position: 'asc' } })).map((row) => row.id)).toEqual([b.id, a.id]);
    await http().put(`${path}/reorder`).set(auth()).send({ ids: [a.id] }).expect(400);
    await http().put(`${path}/reorder`).set(auth()).send({ ids: [a.id, c.id] }).expect(400);
    await http().put(`/api/v1/admin/chapters/${child.id}/books/reorder`).set(auth()).send({ ids: [c.id] }).expect(200);
    noKey(all.body); noKey(courseOnly.body); noKey(chapterOnly.body);
  });

  it('requires verified learners and premium enrollment, enforces modes, and hides drafts', async () => {
    const viewOnly = await storedBook({ canView: true, canDownload: false });
    const downloadOnly = await storedBook({ courseId: null, chapterId: chapter.id, canView: false, canDownload: true });
    const draft = await storedBook({ status: 'draft' });
    const listPath = `/api/v1/courses/${course.id}/books`;
    await http().get(listPath).expect(401);
    const phone = await http().get(listPath).set(auth('book-unverified')).expect(403);
    expect(phone.body.code).toBe('PHONE_NOT_VERIFIED');
    const list = await http().get(listPath).set(auth('book-learner')).expect(200);
    expect(list.body.map((row) => row.id)).toContain(viewOnly.id);
    expect(list.body.map((row) => row.id)).not.toContain(draft.id);
    expect(list.body.every((row) => !('url' in row) && !('previewUrl' in row))).toBe(true);
    noKey(list.body);
    for (const [book, mode, code] of [[viewOnly, 'download', 'BOOK_DOWNLOAD_DISABLED'], [downloadOnly, 'view', 'BOOK_VIEW_DISABLED']]) {
      const denied = await http().get(`/api/v1/books/${book.id}/${mode}`).set(auth('book-learner')).expect(403);
      expect(denied.body.code).toBe(code);
    }
    for (const [book, mode] of [[viewOnly, 'view'], [downloadOnly, 'download']]) {
      const result = await http().get(`/api/v1/books/${book.id}/${mode}`).set(auth('book-learner')).expect(200);
      expect(result.body.url).toContain('signature=');
      expect(Date.parse(result.body.expiresAt) - Date.now()).toBeGreaterThan(295000);
      expect(signed.at(-1)[2]).toMatchObject({ expiresIn: 300, contentType: 'application/pdf', contentDisposition: expect.stringMatching(mode === 'view' ? /^inline;/ : /^attachment;/) });
      noKey(result.body);
    }
    await http().get(`/api/v1/books/${draft.id}/view`).set(auth('book-learner')).expect(404);
    await db.chapter.update({ where: { id: chapter.id }, data: { status: 'draft' } });
    await http().get(`/api/v1/chapters/${chapter.id}/books`).set(auth('book-learner')).expect(404);
    await http().get(`/api/v1/books/${downloadOnly.id}/download`).set(auth('book-learner')).expect(404);
    await db.chapter.update({ where: { id: chapter.id }, data: { status: 'published' } });
    await db.course.update({ where: { id: course.id }, data: { isPremium: true } });
    const premium = await http().get(listPath).set(auth('book-learner')).expect(403);
    expect(premium.body.code).toBe('ENROLLMENT_REQUIRED');
    await http().get(`/api/v1/books/${viewOnly.id}/view`).set(auth('book-learner')).expect(403);
    await db.enrollment.create({ data: { courseId: course.id, userId: learner.id, accessType: 'paid' } });
    await http().get(listPath).set(auth('book-learner')).expect(200);
    await db.course.update({ where: { id: course.id }, data: { status: 'draft' } });
    await http().get(listPath).set(auth('book-learner')).expect(404);
    await http().get(`/api/v1/books/${viewOnly.id}/view`).set(auth('book-learner')).expect(404);
    await db.course.update({ where: { id: course.id }, data: { status: 'published', isPremium: false } });
  });

  it('counts visible books in learner responses, counts all admin books, and cleans books when parents are deleted', async () => {
    const parent = await db.course.create({ data: { ownerId: owner.id, title: 'Book counts', slug: 'book-counts', status: 'published' } });
    const child = await db.chapter.create({ data: { courseId: parent.id, title: 'Published', position: 1, status: 'published' } });
    const hidden = await db.chapter.create({ data: { courseId: parent.id, title: 'Draft', position: 2 } });
    const books = await Promise.all([
      storedBook({ courseId: parent.id, position: 1 }),
      storedBook({ courseId: parent.id, status: 'draft', position: 2 }),
      storedBook({ courseId: null, chapterId: child.id, position: 1 }),
      storedBook({ courseId: null, chapterId: hidden.id, position: 1 }),
    ]);
    const admin = await http().get(`/api/v1/admin/courses/${parent.id}`).set(auth()).expect(200);
    expect(admin.body.bookCount).toBe(4);
    expect(admin.body.chapters.find((row) => row.id === child.id).bookCount).toBe(1);
    const learnerCourse = await http().get(`/api/v1/courses/${parent.id}`).set(auth('book-learner')).expect(200);
    expect(learnerCourse.body.bookCount).toBe(2);
    expect(learnerCourse.body.chapters.find((row) => row.id === child.id).bookCount).toBe(1);
    const catalog = await http().get('/api/v1/courses?search=Book%20counts').set(auth('book-learner')).expect(200);
    expect(catalog.body.data.find((row) => row.id === parent.id).bookCount).toBe(2);
    const learnerChapter = await http().get(`/api/v1/chapters/${child.id}`).set(auth('book-learner')).expect(200);
    expect(learnerChapter.body.bookCount).toBe(1);
    for (const response of [admin, learnerCourse, catalog, learnerChapter]) noKey(response.body);
    await http().delete(`/api/v1/admin/chapters/${child.id}`).set(auth()).expect(200);
    expect(jobs.at(-1)).toEqual(['storage-cleanup', { objects: [{ bucket: 'BOOKS', key: books[2].fileKey }] }]);
    expect(await db.book.findUnique({ where: { id: books[2].id } })).toBeNull();
    await http().delete(`/api/v1/admin/courses/${parent.id}`).set(auth()).expect(200);
    expect(jobs.at(-1)[0]).toBe('storage-cleanup');
    expect(jobs.at(-1)[1].objects).toEqual(expect.arrayContaining([books[0], books[1], books[3]].map((book) => ({ bucket: 'BOOKS', key: book.fileKey }))));
    expect(await db.book.count({ where: { id: { in: books.map((book) => book.id) } } })).toBe(0);
  });
});
