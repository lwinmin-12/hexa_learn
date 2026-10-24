import {Inject, Injectable} from '@nestjs/common';
import {isUUID} from 'class-validator';
import {PrismaService} from '../prisma/prisma.service.js';
import {PageDto, fail, listed, paging, published} from '../platform/common.js';
import {StorageService} from '../platform/storage.service.js';
import {serial} from '../platform/transaction.js';
import {CourseQuery} from './courses.dto.js';
import {LearningAccessService} from './access.service.js';
import type {Prisma} from '@prisma/client';
const bookCounts = {
  _count: { select: { books: { where: { status: 'published' as const } } } },
  chapters: {
    where: { status: 'published' as const },
    select: { _count: { select: { books: { where: { status: 'published' as const } } } } },
  },
};
export const episodeOutline = {
  id: true,
  title: true,
  description: true,
  position: true,
  status: true,
  videoDurationSec: true,
} as const;
@Injectable()
export class CoursesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(LearningAccessService)
    private readonly access: LearningAccessService,
    @Inject(StorageService) private readonly storage:StorageService,
  ) {}
  async list(q: CourseQuery) {
    const where = {
      ...published(),
      ...(q.isPremium === undefined ? {} : { isPremium: q.isPremium }),
      ...(q.search
        ? { title: { contains: q.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.course.findMany({
        where,
        include: bookCounts,
        ...paging(q),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.course.count({ where }),
    ]);
    return listed(await Promise.all(data.map(c=>this.summary(c))), total, q);
  }
  async detail(id: string) {
    const course = (
      (await this.db.course.findFirst({
        where: {
          ...(isUUID(id) ? { OR: [{ id }, { slug: id }] } : { slug: id }),
          AND: [published()],
        },
        include: {
          _count: bookCounts._count,
          chapters: {
            where: { status: 'published' },
            orderBy: { position: 'asc' },
            include: {
              _count: bookCounts._count,
              episodes: {
                where: published(),
                orderBy: { position: 'asc' },
                select: episodeOutline,
              },
            },
          },
        },
      })) ?? fail(404, 'NOT_FOUND', 'Course not found')
    );
    const { _count, ...metadata } = course;
    return this.cover({
      ...metadata,
      bookCount: _count.books + course.chapters.reduce((total, chapter) => total + chapter._count.books, 0),
      chapters: course.chapters.map(({ _count, ...chapter }) => ({ ...chapter, bookCount: _count.books })),
    });
  }
  private summary(course: Prisma.CourseGetPayload<{ include: typeof bookCounts }>) {
    const { _count, chapters, ...metadata } = course;
    return this.cover({ ...metadata, bookCount: _count.books + chapters.reduce((total, chapter) => total + chapter._count.books, 0) });
  }
  private async cover<T extends {coverUrl:string|null}>(course:T) {return {...course,coverUrl:course.coverUrl?await this.storage.mediaUrl(course.coverUrl):null};}
  async mine(userId: string, q: PageDto) {
    const where = { userId, course: published() };
    const [data, total] = await this.db.$transaction([
      this.db.enrollment.findMany({
        where,
        ...paging(q),
        include: { course: { include: bookCounts } },
        orderBy: { enrolledAt: 'desc' },
      }),
      this.db.enrollment.count({ where }),
    ]);
    return listed(await Promise.all(data.map(async e=>({...e,course:await this.summary(e.course)}))), total, q);
  }
  async enroll(userId: string, id: string) {
    await this.access.course(id);
    return serial(this.db, async (tx) => {
      const course = await tx.course.findFirst({
        where: { id, ...published() },
      });
      if (!course) fail(404, 'NOT_FOUND', 'Course not found');
      if (course.isPremium)
        fail(402, 'PAYMENT_REQUIRED', 'This course requires payment');
      const enrollment = await tx.enrollment.upsert({
        where: { userId_courseId: { userId, courseId: id } },
        create: { userId, courseId: id, accessType: 'free' },
        update: {},
      });
      const channel = await tx.channel.upsert({
        where: { courseId: id },
        create: { courseId: id, name: course.title },
        update: {},
      });
      await tx.channelMember.upsert({
        where: { channelId_userId: { channelId: channel.id, userId } },
        create: { channelId: channel.id, userId },
        update: {},
      });
      return enrollment;
    });
  }
  async check(userId: string, id: string) {
    const course = await this.access.course(id);
    const e = await this.db.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId: id } },
    });
    return {
      access: !course.isPremium ? 'free' : e ? e.accessType : 'none',
      enrolled: !!e,
    };
  }
}
