import { Inject, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { OwnershipService } from '../platform/ownership.service.js';
import { StorageService, Bucket } from '../platform/storage.service.js';
import { JobsService } from '../platform/jobs.service.js';
import { fail, paging, listed } from '../platform/common.js';
import { serial } from '../platform/transaction.js';
import { imageFile } from '../platform/uploads.js';
import { reorderRows } from '../platform/reorder.js';
import {
  AdminCourseQuery,
  CourseDto,
  UpdateCourseDto,
  ChapterDto,
  UpdateChapterDto,
  EpisodeDto,
  UpdateEpisodeDto,
  ReorderDto,
  UploadVideoDto,
  ConfirmVideoDto,
} from './admin-content.dto.js';
const mediaType = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};
@Injectable()
export class AdminContentService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(OwnershipService) private readonly scope: OwnershipService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}
  async list(user: User, q: AdminCourseQuery) {
    const where = {
      ...this.scope.filter(user),
      status: q.status,
      isPremium: q.isPremium,
      ...(q.search
        ? { title: { contains: q.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.course.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: 'desc' },
      }),
      this.db.course.count({ where }),
    ]);
    return listed(
      await Promise.all(data.map((course) => this.presentCourse(course))),
      total,
      q,
    );
  }
  async detail(user: User, id: string) {
    await this.scope.check(user, 'course', id);
    const course = await this.db.course.findUniqueOrThrow({
      where: { id },
      include: {
        chapters: {
          orderBy: { position: 'asc' },
          include: { episodes: { orderBy: { position: 'asc' } } },
        },
      },
    });
    return this.presentCourse(course);
  }
  private async presentCourse<T extends { coverUrl: string | null }>(
    course: T,
  ) {
    return {
      ...course,
      coverUrl: course.coverUrl
        ? await this.storage.mediaUrl(course.coverUrl)
        : null,
    };
  }
  private premium(
    isPremium: boolean,
    price?: Prisma.Decimal | string | null,
    currency?: string | null,
  ) {
    if (!isPremium) return { isPremium: false, price: null, currency: null };
    if (
      !price ||
      new Prisma.Decimal(price).lte(0) ||
      !currency ||
      !/^[a-z]{3}$/i.test(currency)
    )
      fail(
        400,
        'INVALID_PRICE',
        'Premium courses require a positive price and 3-letter currency',
      );
    return { isPremium: true, price, currency: currency.toUpperCase() };
  }
  async create(user: User, dto: CourseDto) {
    const premium = this.premium(
      dto.isPremium ?? false,
      dto.price,
      dto.currency,
    );
    return serial(this.db, async (tx) => {
      const base =
        dto.slug ??
        (dto.title
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 170) ||
          'course');
      let slug = base;
      let n = 2;
      if (dto.slug && (await tx.course.findUnique({ where: { slug } })))
        fail(409, 'SLUG_EXISTS', 'Slug is already used');
      while (await tx.course.findUnique({ where: { slug } }))
        slug = `${base}-${n++}`;
      return tx.course.create({
        data: {
          ...dto,
          ...premium,
          slug,
          ownerId: user.id,
          channel: { create: { name: dto.title } },
        },
      });
    });
  }
  async update(user: User, id: string, dto: UpdateCourseDto) {
    const old = await this.scope.check(user, 'course', id);
    const premium = this.premium(
      dto.isPremium ?? old.isPremium,
      dto.price ?? old.price,
      dto.currency ?? old.currency,
    );
    return this.db.course.update({
      where: { id },
      data: { ...dto, ...premium },
    });
  }
  async cover(user: User, id: string, file: Express.Multer.File) {
    const old = await this.scope.check(user, 'course', id);
    const image = imageFile(file);
    const key = `courses/${id}/covers/${randomUUID()}.${image.ext}`;
    await this.storage.put('MEDIA', key, image.buffer, image.contentType);
    const result = await this.db.course.update({
      where: { id },
      data: { coverUrl: key },
    });
    if (old.coverUrl)
      await this.jobs.add('storage-cleanup', {
        objects: [{ bucket: 'MEDIA', key: old.coverUrl }],
      });
    return { ...result, coverUrl: await this.storage.mediaUrl(key) };
  }
  async chapter(user: User, id: string, dto: ChapterDto) {
    await this.scope.check(user, 'course', id);
    return serial(this.db, async (tx) => {
      const max = await tx.chapter.aggregate({
        where: { courseId: id },
        _max: { position: true },
      });
      return tx.chapter.create({
        data: { ...dto, courseId: id, position: (max._max.position ?? 0) + 1 },
      });
    });
  }
  async updateChapter(user: User, id: string, dto: UpdateChapterDto) {
    await this.scope.check(user, 'chapter', id);
    return this.db.chapter.update({ where: { id }, data: dto });
  }
  async episode(user: User, id: string, dto: EpisodeDto) {
    await this.scope.check(user, 'chapter', id);
    return serial(this.db, async (tx) => {
      const max = await tx.episode.aggregate({
        where: { chapterId: id },
        _max: { position: true },
      });
      return tx.episode.create({
        data: { ...dto, chapterId: id, position: (max._max.position ?? 0) + 1 },
      });
    });
  }
  async updateEpisode(user: User, id: string, dto: UpdateEpisodeDto) {
    await this.scope.check(user, 'episode', id);
    return this.db.episode.update({ where: { id }, data: dto });
  }
  async reorder(
    user: User,
    kind: 'chapter' | 'episode',
    id: string,
    dto: ReorderDto,
  ) {
    await this.scope.check(user, kind === 'chapter' ? 'course' : 'chapter', id);
    return serial(this.db, async (tx) =>
      kind === 'chapter'
        ? reorderRows(
            await tx.chapter.findMany({
              where: { courseId: id },
              select: { id: true, position: true },
            }),
            dto.ids,
            (id, position) =>
              tx.chapter.update({ where: { id }, data: { position } }),
          )
        : reorderRows(
            await tx.episode.findMany({
              where: { chapterId: id },
              select: { id: true, position: true },
            }),
            dto.ids,
            (id, position) =>
              tx.episode.update({ where: { id }, data: { position } }),
          ),
    );
  }
  async delete(user: User, kind: 'course' | 'chapter' | 'episode', id: string) {
    await this.scope.check(user, kind, id);
    const objects = await serial(this.db, async (tx) => {
      const out: { bucket: Bucket; key: string }[] = [];
      const chapters = await tx.chapter.findMany({
        where:
          kind === 'course'
            ? { courseId: id }
            : kind === 'chapter'
              ? { id }
              : { episodes: { some: { id } } },
        include: {
          episodes: { where: kind === 'episode' ? { id } : {} },
          audioTracks: true,
          flashcards: true,
        },
      });
      for (const c of chapters) {
        for (const e of c.episodes)
          if (e.videoUrl) out.push({ bucket: 'VIDEOS', key: e.videoUrl });
        if (kind !== 'episode') {
          for (const a of c.audioTracks)
            out.push({ bucket: 'MEDIA', key: a.audioUrl });
          for (const f of c.flashcards)
            if (f.audioUrl) out.push({ bucket: 'MEDIA', key: f.audioUrl });
        }
      }
      if (kind === 'course') {
        if (await tx.payment.count({ where: { courseId: id } }))
          fail(
            409,
            'COURSE_HAS_PAYMENTS',
            'Courses with payment history cannot be deleted',
          );
        const c = await tx.course.findUniqueOrThrow({ where: { id } });
        if (c.coverUrl) out.push({ bucket: 'MEDIA', key: c.coverUrl });
        await tx.promoCode.updateMany({
          where: { courseId: id },
          data: { isActive: false },
        });
        await tx.course.delete({ where: { id } });
      } else if (kind === 'chapter') await tx.chapter.delete({ where: { id } });
      else await tx.episode.delete({ where: { id } });
      return out;
    });
    if (objects.length) await this.jobs.add('storage-cleanup', { objects });
    return { deleted: true };
  }
  async uploadUrl(user: User, id: string, dto: UploadVideoDto) {
    const course = await this.scope.check(user, 'episode', id);
    const key = `courses/${course.id}/episodes/${id}/${randomUUID()}.${dto.ext}`;
    return {
      key,
      uploadUrl: await this.storage.putUrl('VIDEOS', key, mediaType[dto.ext]),
      storageKey: key,
      method: 'PUT',
      headers: { 'Content-Type': mediaType[dto.ext] },
      expiresIn: 900,
    };
  }
  async confirm(user: User, id: string, dto: ConfirmVideoDto) {
    const course = await this.scope.check(user, 'episode', id);
    const prefix = `courses/${course.id}/episodes/${id}/`;
    if (
      !dto.storageKey.startsWith(prefix) ||
      !/^[0-9a-f-]{36}\.(mp4|mov|webm)$/i.test(
        dto.storageKey.slice(prefix.length),
      )
    )
      fail(400, 'INVALID_STORAGE_KEY', 'Key must be issued for this episode');
    const object = await this.storage.head('VIDEOS', dto.storageKey);
    if (object.ContentLength === 0)
      fail(400, 'EMPTY_VIDEO', 'Video must not be empty');
    const old = await this.db.episode.findUniqueOrThrow({ where: { id } });
    const result = await this.db.episode.update({
      where: { id },
      data: {
        videoUrl: dto.storageKey,
        videoDurationSec: dto.durationSec,
        videoUploadStatus: 'ready',
        videoScheduledAt: dto.scheduledAt ?? null,
      },
    });
    if (old.videoUrl && old.videoUrl !== dto.storageKey)
      await this.jobs.add('storage-cleanup', {
        objects: [{ bucket: 'VIDEOS', key: old.videoUrl }],
      });
    return result;
  }
  async removeVideo(user: User, id: string) {
    await this.scope.check(user, 'episode', id);
    const e = await this.db.episode.findUniqueOrThrow({ where: { id } });
    const result = await this.db.episode.update({
      where: { id },
      data: {
        videoUrl: null,
        videoDurationSec: null,
        videoUploadStatus: 'pending',
        videoScheduledAt: null,
      },
    });
    if (e.videoUrl)
      await this.jobs.add('storage-cleanup', {
        objects: [{ bucket: 'VIDEOS', key: e.videoUrl }],
      });
    return result;
  }
}
