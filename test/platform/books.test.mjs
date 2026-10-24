import 'reflect-metadata';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BooksService } from '../../dist/books/books.service.js';
import { BookDto, UpdateBookDto } from '../../dist/books/books.dto.js';
import { OwnershipService } from '../../dist/platform/ownership.service.js';
import { LearningAccessService } from '../../dist/courses/access.service.js';

const user = { id: 'admin', role: 'page_admin' };
let directory;
let file;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'books-test-'));
  const path = join(directory, 'upload');
  await writeFile(path, '%PDF-1.7\nbook');
  file = {
    path,
    originalname: '../Vocabulary.pdf',
    mimetype: 'application/pdf',
    size: 13,
  };
});
afterEach(async () => {
  await rm(directory, { force: true, recursive: true });
});

function fixture(overrides = {}) {
  let row = {
    id: 'book',
    courseId: 'course',
    chapterId: null,
    title: 'Vocabulary',
    description: null,
    fileKey: 'books/course/old.pdf',
    fileName: 'Vocabulary.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 13n,
    pageCount: null,
    canView: true,
    canDownload: false,
    status: 'draft',
    position: 3,
    createdAt: new Date('2026-10-24T00:00:00Z'),
    updatedAt: new Date(),
    course: { id: 'course', title: 'Japanese' },
    chapter: null,
    ...overrides,
  };
  const db = {
    course: {
      findUnique: jest.fn(async () => ({ id: 'course' })),
      findFirst: jest.fn(async ({ where }) =>
        !where.ownerId || where.ownerId === user.id
          ? {
              id: 'course',
              title: 'Japanese',
              status: 'published',
              isPremium: false,
            }
          : null,
      ),
    },
    chapter: {
      findUnique: jest.fn(async () => ({ id: 'chapter', courseId: 'course' })),
      findFirst: jest.fn(async () => ({
        id: 'chapter',
        course: { id: 'course', isPremium: false },
      })),
    },
    enrollment: { findUnique: jest.fn(async () => null) },
    book: {
      aggregate: jest.fn(async () => ({ _max: { position: 3 } })),
      create: jest.fn(async ({ data }) => {
        row = { ...row, ...data };
        return row;
      }),
      update: jest.fn(async ({ data }) => {
        row = { ...row, ...data };
        return row;
      }),
      findUnique: jest.fn(async () => row),
      findUniqueOrThrow: jest.fn(async () => row),
      findFirst: jest.fn(async ({ where }) =>
        where.status && row.status !== where.status ? null : row,
      ),
      findMany: jest.fn(async () => [row]),
      count: jest.fn(async () => 1),
      delete: jest.fn(async () => row),
    },
    $transaction: jest.fn(async (work) =>
      typeof work === 'function' ? work(db) : Promise.all(work),
    ),
  };
  const storage = {
    putFile: jest.fn(async (_bucket, _key, path) => {
      expect((await readFile(path)).toString()).toContain('%PDF-');
    }),
    delete: jest.fn(async () => {}),
    get: jest.fn(async () => 'https://storage.test/signed'),
  };
  const jobs = { add: jest.fn(async () => {}) };
  return {
    db,
    storage,
    jobs,
    service: new BooksService(
      db,
      new OwnershipService(db),
      storage,
      jobs,
      new LearningAccessService(db),
    ),
  };
}

it('creates a streamed private PDF at max+1 and presents no storage key', async () => {
  const { service, db, storage } = fixture();
  const result = await service.create(
    user,
    { courseId: 'course' },
    { title: 'Vocabulary' },
    file,
  );
  expect(storage.putFile).toHaveBeenCalledWith(
    'BOOKS',
    expect.stringMatching(/^books\/course\/[\da-f-]+\.pdf$/),
    file.path,
    'application/pdf',
  );
  expect(db.$transaction).toHaveBeenCalledWith(
    expect.any(Function),
    expect.objectContaining({ isolationLevel: 'Serializable' }),
  );
  expect(result).toMatchObject({
    position: 4,
    sizeBytes: '13',
    fileName: 'Vocabulary.pdf',
    scope: 'course',
    attachedTo: { type: 'course', id: 'course', title: 'Japanese' },
    canView: true,
    canDownload: false,
    status: 'draft',
  });
  expect(result).not.toHaveProperty('fileKey');
});

it('sanitizes paths and controls without splitting a filename Unicode character', async () => {
  const { service } = fixture();
  const result = await service.create(user, { courseId: 'course' }, { title: 'Vocabulary' }, {
    ...file, originalname: `C:\\private\\${'x'.repeat(145)}🦊\r\n.pdf`,
  });
  expect(result.fileName).toBe(`${'x'.repeat(145)}.pdf`);
  expect(result.fileName.length).toBeLessThanOrEqual(150);
  await expect(service.detail(user, result.id)).resolves.toHaveProperty('previewUrl');
});

it.each([
  ['wrong extension', { originalname: 'book.txt' }],
  ['wrong MIME', { mimetype: 'text/plain' }],
  ['oversize', { size: 51 * 1024 * 1024 }],
])(
  'rejects %s before touching storage or creating a row',
  async (_name, overrides) => {
    const { service, db, storage } = fixture();
    await expect(
      service.create(
        user,
        { courseId: 'course' },
        { title: 'Vocabulary' },
        { ...file, ...overrides },
      ),
    ).rejects.toMatchObject({
      status: overrides.size ? 413 : 400,
      response: {
        code: overrides.size ? 'BOOK_TOO_LARGE' : 'BOOK_INVALID_FILE',
      },
    });
    expect(storage.putFile).not.toHaveBeenCalled();
    expect(db.book.create).not.toHaveBeenCalled();
  },
);

it('rejects a disguised PDF signature and a missing file', async () => {
  const { service, db, storage } = fixture();
  await writeFile(file.path, '<html>');
  for (const upload of [file, undefined])
    await expect(
      service.create(
        user,
        { courseId: 'course' },
        { title: 'Vocabulary' },
        upload,
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'BOOK_INVALID_FILE' },
    });
  expect(storage.putFile).not.toHaveBeenCalled();
  expect(db.book.create).not.toHaveBeenCalled();
});

it('removes an uploaded object if the database insert fails and creates nothing on storage failure', async () => {
  const { service, db, storage } = fixture();
  db.book.create.mockRejectedValueOnce(new Error('insert failed'));
  await expect(
    service.create(user, { courseId: 'course' }, { title: 'Vocabulary' }, file),
  ).rejects.toThrow('insert failed');
  expect(storage.delete).toHaveBeenCalledWith(
    'BOOKS',
    storage.putFile.mock.calls[0][1],
  );
  db.book.create.mockClear();
  storage.putFile.mockRejectedValueOnce(new Error('storage failed'));
  await expect(
    service.create(user, { courseId: 'course' }, { title: 'Vocabulary' }, file),
  ).rejects.toThrow('storage failed');
  expect(db.book.create).not.toHaveBeenCalled();
});

it('enforces exactly one parent and ownership through the course before storage', async () => {
  const { service, storage } = fixture();
  for (const parent of [{}, { courseId: 'course', chapterId: 'chapter' }])
    await expect(
      service.create(user, parent, { title: 'Vocabulary' }, file),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'BOOK_ONE_PARENT_REQUIRED' },
    });
  for (const parent of [{ courseId: 'course' }, { chapterId: 'chapter' }])
    await expect(
      service.create(
        { ...user, id: 'other' },
        parent,
        { title: 'Vocabulary' },
        file,
      ),
    ).rejects.toMatchObject({ status: 404 });
  expect(storage.putFile).not.toHaveBeenCalled();
});

it('parses multipart booleans and validates JSON single-field PATCH without resetting defaults', async () => {
  const dto = plainToInstance(BookDto, {
    title: '  Vocabulary  ',
    canView: 'false',
    canDownload: 'true',
  });
  expect(await validate(dto)).toHaveLength(0);
  expect(dto).toMatchObject({
    title: 'Vocabulary',
    canView: false,
    canDownload: true,
  });
  for (const input of [
    { canView: 'garbage' },
    { status: 'scheduled' },
    { title: ' ' },
    { title: null },
    { canView: null },
  ])
    expect(
      (await validate(plainToInstance(UpdateBookDto, input))).length,
    ).toBeGreaterThan(0);
  const patch = plainToInstance(UpdateBookDto, { canDownload: true });
  expect(await validate(patch)).toHaveLength(0);
  const { service, db } = fixture({ status: 'published' });
  const result = await service.update(user, 'book', patch);
  expect(db.book.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: patch }),
  );
  expect(result).toMatchObject({
    canView: true,
    canDownload: true,
    status: 'published',
  });
  expect(result).not.toHaveProperty('fileKey');
});

it('checks final published permissions on create and one-field updates', async () => {
  const { service, storage, db } = fixture({ status: 'published' });
  await expect(
    service.create(
      user,
      { courseId: 'course' },
      {
        title: 'Vocabulary',
        status: 'published',
        canView: false,
        canDownload: false,
      },
      file,
    ),
  ).rejects.toMatchObject({
    status: 400,
    response: { code: 'BOOK_NO_ACCESS_MODE' },
  });
  await expect(
    service.update(user, 'book', { canView: false }),
  ).rejects.toMatchObject({
    status: 400,
    response: { code: 'BOOK_NO_ACCESS_MODE' },
  });
  expect(storage.putFile).not.toHaveBeenCalled();
  expect(db.book.update).not.toHaveBeenCalled();
});

it('replaces the PDF and queues only the old object after saving', async () => {
  const { service, storage, jobs } = fixture();
  const result = await service.replace(user, 'book', file);
  expect(jobs.add).toHaveBeenCalledWith('storage-cleanup', {
    objects: [{ bucket: 'BOOKS', key: 'books/course/old.pdf' }],
  });
  expect(storage.delete).not.toHaveBeenCalled();
  expect(result).not.toHaveProperty('fileKey');
});

it('rolls back only the new replacement on database failure, preserving it on a later queue failure', async () => {
  const { service, db, storage, jobs } = fixture();
  db.book.update.mockRejectedValueOnce(new Error('update failed'));
  await expect(service.replace(user, 'book', file)).rejects.toThrow(
    'update failed',
  );
  expect(storage.delete).toHaveBeenCalledWith(
    'BOOKS',
    storage.putFile.mock.calls[0][1],
  );
  expect(jobs.add).not.toHaveBeenCalled();
  storage.delete.mockClear();
  jobs.add.mockRejectedValueOnce(new Error('queue failed'));
  await expect(service.replace(user, 'book', file)).rejects.toThrow(
    'queue failed',
  );
  expect(storage.delete).not.toHaveBeenCalled();
});

it('hides drafts and denies premium access before signing a learner URL', async () => {
  const { service, db, storage } = fixture();
  await expect(
    service.learnerUrl('learner', 'book', 'view'),
  ).rejects.toMatchObject({ status: 404 });
  db.book.findFirst.mockResolvedValueOnce({
    id: 'book',
    courseId: 'course',
    status: 'published',
  });
  db.course.findFirst.mockResolvedValueOnce({ id: 'course', isPremium: true });
  await expect(
    service.learnerUrl('learner', 'book', 'view'),
  ).rejects.toMatchObject({
    status: 403,
    response: { code: 'ENROLLMENT_REQUIRED' },
  });
  expect(storage.get).not.toHaveBeenCalled();
});

it.each([
  ['view', { canView: false, canDownload: true }, 'BOOK_VIEW_DISABLED'],
  ['download', { canView: true, canDownload: false }, 'BOOK_DOWNLOAD_DISABLED'],
])('denies disabled %s mode', async (mode, modes, code) => {
  const { service, storage } = fixture({ status: 'published', ...modes });
  await expect(
    service.learnerUrl('learner', 'book', mode),
  ).rejects.toMatchObject({ status: 403, response: { code } });
  expect(storage.get).not.toHaveBeenCalled();
});

it('signs learner PDFs for five minutes with explicit disposition and admin previews for one hour', async () => {
  const { service, storage } = fixture({
    status: 'published',
    canDownload: true,
  });
  const view = await service.learnerUrl('learner', 'book', 'view');
  expect(view).toMatchObject({
    url: 'https://storage.test/signed',
    expiresAt: expect.any(String),
  });
  expect(storage.get).toHaveBeenLastCalledWith(
    'BOOKS',
    'books/course/old.pdf',
    {
      expiresIn: 300,
      contentDisposition: expect.stringMatching(/^inline;/),
      contentType: 'application/pdf',
    },
  );
  await service.learnerUrl('learner', 'book', 'download');
  expect(storage.get).toHaveBeenLastCalledWith(
    'BOOKS',
    'books/course/old.pdf',
    {
      expiresIn: 300,
      contentDisposition: expect.stringMatching(
        /^attachment; filename="Vocabulary.pdf";/,
      ),
      contentType: 'application/pdf',
    },
  );
  const detail = await service.detail(user, 'book');
  expect(detail).not.toHaveProperty('fileKey');
  expect(storage.get).toHaveBeenLastCalledWith(
    'BOOKS',
    'books/course/old.pdf',
    expect.objectContaining({ expiresIn: 3600 }),
  );
});
