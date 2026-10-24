import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { extname } from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { OwnershipService } from '../platform/ownership.service.js';
import { StorageService } from '../platform/storage.service.js';
import { JobsService } from '../platform/jobs.service.js';
import { LearningAccessService } from '../courses/access.service.js';
import { fail, listed, paging } from '../platform/common.js';
import { serial } from '../platform/transaction.js';
import { reorderRows } from '../platform/reorder.js';
import { BookDto, BookQuery, UpdateBookDto } from './books.dto.js';
import { bookMaxBytes } from './book-upload.interceptor.js';

const attachment = {
  course: { select: { id: true, title: true } },
  chapter: { select: { id: true, title: true } },
} satisfies Prisma.BookInclude;
type AttachedBook = Prisma.BookGetPayload<{ include: typeof attachment }>;
export type BookParent = {
  courseId?: string | null;
  chapterId?: string | null;
};

function parentWhere(parent: BookParent) {
  if (Number(!!parent.courseId) + Number(!!parent.chapterId) !== 1)
    fail(
      400,
      'BOOK_ONE_PARENT_REQUIRED',
      'Book must belong to exactly one course or chapter',
    );
  return parent.courseId
    ? { courseId: parent.courseId, chapterId: null }
    : { chapterId: parent.chapterId!, courseId: null };
}

function accessMode(book: {
  status: string;
  canView: boolean;
  canDownload: boolean;
}) {
  if (book.status === 'published' && !book.canView && !book.canDownload)
    fail(
      400,
      'BOOK_NO_ACCESS_MODE',
      'Published books require view or download permission',
    );
}

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(OwnershipService) private readonly scope: OwnershipService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(JobsService) private readonly jobs: JobsService,
    @Inject(LearningAccessService)
    private readonly access: LearningAccessService,
  ) {}

  private present(book: AttachedBook) {
    const parent = book.course ?? book.chapter!;
    const type = book.courseId ? 'course' : 'chapter';
    return {
      id: book.id,
      title: book.title,
      description: book.description,
      fileName: book.fileName,
      mimeType: book.mimeType,
      sizeBytes: book.sizeBytes.toString(),
      pageCount: book.pageCount,
      canView: book.canView,
      canDownload: book.canDownload,
      status: book.status,
      position: book.position,
      scope: type,
      attachedTo: { type, id: parent.id, title: parent.title },
      createdAt: book.createdAt,
    };
  }

  private async file(file: Express.Multer.File | undefined) {
    if (!file) fail(400, 'BOOK_INVALID_FILE', 'A PDF file is required');
    if (file.size > bookMaxBytes())
      fail(413, 'BOOK_TOO_LARGE', 'Book exceeds BOOK_MAX_MB');
    if (
      file.mimetype !== 'application/pdf' ||
      extname(file.originalname).toLowerCase() !== '.pdf' ||
      !file.path
    )
      fail(
        400,
        'BOOK_INVALID_FILE',
        'An application/pdf file with a .pdf extension is required',
      );
    const handle = await open(file.path, 'r');
    try {
      const signature = Buffer.alloc(5);
      const { bytesRead } = await handle.read(signature, 0, 5, 0);
      if (bytesRead !== 5 || signature.toString('ascii') !== '%PDF-')
        fail(400, 'BOOK_INVALID_FILE', 'File does not have a PDF signature');
    } finally {
      await handle.close();
    }
    const base = file.originalname
      .replace(/\\/g, '/')
      .split('/')
      .pop()!
      .replace(/\p{Cc}/gu, '')
      .replace(/\.pdf$/i, '')
      .trim();
    return {
      fileName: `${(base || 'book').slice(0, 146).replace(/[\uD800-\uDBFF]$/, '')}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: BigInt(file.size),
      pageCount: null,
    };
  }

  private async rollback(key: string) {
    try {
      await this.storage.delete('BOOKS', key);
      this.logger.warn('Removed an uncommitted book upload after database failure');
    } catch {
      this.logger.error('Failed to clean up an uncommitted book upload');
    }
  }

  async create(
    user: User,
    parent: BookParent,
    dto: BookDto,
    file: Express.Multer.File | undefined,
  ) {
    const where = parentWhere(parent);
    const modes = {
      status: dto.status ?? 'draft',
      canView: dto.canView ?? true,
      canDownload: dto.canDownload ?? false,
    };
    accessMode(modes);
    const course = await this.scope.check(
      user,
      parent.courseId ? 'course' : 'chapter',
      parent.courseId ?? parent.chapterId!,
    );
    const metadata = await this.file(file);
    const key = `books/${course.id}/${randomUUID()}.pdf`;
    await this.storage.putFile('BOOKS', key, file!.path, metadata.mimeType);
    let book: AttachedBook;
    try {
      book = await serial(this.db, async (tx) => {
        const max = await tx.book.aggregate({
          where,
          _max: { position: true },
        });
        return tx.book.create({
          data: {
            ...where,
            title: dto.title,
            description: dto.description,
            ...modes,
            ...metadata,
            fileKey: key,
            position: (max._max.position ?? 0) + 1,
          },
          include: attachment,
        });
      });
    } catch (error) {
      await this.rollback(key);
      throw error;
    }
    return this.present(book);
  }

  async list(user: User, courseId: string, query: BookQuery) {
    await this.scope.check(user, 'course', courseId);
    if (query.chapterId) {
      const chapter = await this.db.chapter.findFirst({
        where: { id: query.chapterId, courseId },
        select: { id: true },
      });
      if (!chapter) fail(404, 'NOT_FOUND', 'Chapter not found');
    }
    const where: Prisma.BookWhereInput = {
      ...(query.scope === 'course'
        ? { courseId }
        : query.scope === 'chapter'
          ? { chapter: { courseId } }
          : { OR: [{ courseId }, { chapter: { courseId } }] }),
      ...(query.chapterId ? { chapterId: query.chapterId } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };
    const [books, total] = await this.db.$transaction([
      this.db.book.findMany({
        where,
        include: attachment,
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        ...paging(query),
      }),
      this.db.book.count({ where }),
    ]);
    return listed(
      books.map((book) => this.present(book)),
      total,
      query,
    );
  }

  async detail(user: User, id: string) {
    await this.scope.check(user, 'book', id);
    const book = await this.db.book.findUniqueOrThrow({
      where: { id },
      include: attachment,
    });
    return {
      ...this.present(book),
      previewUrl: await this.storage.get('BOOKS', book.fileKey, {
        expiresIn: 3600,
        contentDisposition: this.disposition(book.fileName, false),
        contentType: 'application/pdf',
      }),
    };
  }

  async update(user: User, id: string, dto: UpdateBookDto) {
    await this.scope.check(user, 'book', id);
    const book = await serial(this.db, async (tx) => {
      const current = await tx.book.findUniqueOrThrow({ where: { id } });
      accessMode({
        status: dto.status ?? current.status,
        canView: dto.canView ?? current.canView,
        canDownload: dto.canDownload ?? current.canDownload,
      });
      return tx.book.update({ where: { id }, data: dto, include: attachment });
    });
    return this.present(book);
  }

  async replace(user: User, id: string, file: Express.Multer.File | undefined) {
    const course = await this.scope.check(user, 'book', id);
    const metadata = await this.file(file);
    const key = `books/${course.id}/${randomUUID()}.pdf`;
    await this.storage.putFile('BOOKS', key, file!.path, metadata.mimeType);
    let result: { book: AttachedBook; oldKey: string };
    try {
      result = await serial(this.db, async (tx) => {
        const old = await tx.book.findUniqueOrThrow({ where: { id } });
        const book = await tx.book.update({
          where: { id },
          data: { ...metadata, fileKey: key },
          include: attachment,
        });
        return { book, oldKey: old.fileKey };
      });
    } catch (error) {
      await this.rollback(key);
      throw error;
    }
    await this.cleanup(result.oldKey);
    return this.present(result.book);
  }

  private cleanup(key: string) {
    return this.jobs.add('storage-cleanup', {
      objects: [{ bucket: 'BOOKS', key }],
    });
  }

  async delete(user: User, id: string) {
    await this.scope.check(user, 'book', id);
    const book = await this.db.book.delete({ where: { id } });
    await this.cleanup(book.fileKey);
    return { deleted: true };
  }

  async reorder(user: User, parent: BookParent, ids: string[]) {
    const where = parentWhere(parent);
    await this.scope.check(
      user,
      parent.courseId ? 'course' : 'chapter',
      parent.courseId ?? parent.chapterId!,
    );
    return serial(this.db, async (tx) => {
      const rows = await tx.book.findMany({
        where,
        select: { id: true, position: true },
      });
      return reorderRows(rows, ids, (id, position) =>
        tx.book.update({ where: { id }, data: { position } }),
      );
    });
  }

  async learnerList(userId: string, parent: BookParent) {
    const where = parentWhere(parent);
    const course = parent.courseId
      ? await this.access.course(parent.courseId)
      : (await this.access.chapter(parent.chapterId!)).course;
    await this.access.require(course, userId);
    const books = await this.db.book.findMany({
      where: { ...where, status: 'published' },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        description: true,
        sizeBytes: true,
        pageCount: true,
        canView: true,
        canDownload: true,
      },
    });
    return books.map((book) => ({
      ...book,
      sizeBytes: book.sizeBytes.toString(),
    }));
  }

  private disposition(fileName: string, download: boolean) {
    const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
    const encoded = encodeURIComponent(fileName).replace(
      /['()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
  }

  async learnerUrl(userId: string, id: string, mode: 'view' | 'download') {
    const book = await this.db.book.findFirst({
      where: { id, status: 'published' },
    });
    if (!book) fail(404, 'NOT_FOUND', 'Book not found');
    const course = book.courseId
      ? await this.access.course(book.courseId)
      : (await this.access.chapter(book.chapterId!)).course;
    await this.access.require(course, userId);
    if (mode === 'view' ? !book.canView : !book.canDownload)
      fail(
        403,
        mode === 'view' ? 'BOOK_VIEW_DISABLED' : 'BOOK_DOWNLOAD_DISABLED',
        `Book ${mode} is disabled`,
      );
    const url = await this.storage.get('BOOKS', book.fileKey, {
      expiresIn: 300,
      contentDisposition: this.disposition(book.fileName, mode === 'download'),
      contentType: 'application/pdf',
    });
    return { url, expiresAt: new Date(Date.now() + 300_000).toISOString() };
  }
}
