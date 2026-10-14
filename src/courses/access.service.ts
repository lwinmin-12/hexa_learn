import {Inject, Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service.js';
import {fail, published} from '../platform/common.js';
@Injectable()
export class LearningAccessService {
  constructor(@Inject(PrismaService) readonly db: PrismaService) {}
  async course(id: string) {
    return (
      (await this.db.course.findFirst({ where: { id, ...published() } })) ??
      fail(404, 'NOT_FOUND', 'Course not found')
    );
  }
  async chapter(id: string) {
    return (
      (await this.db.chapter.findFirst({
        where: { id, status: 'published', course: published() },
        include: { course: true },
      })) ?? fail(404, 'NOT_FOUND', 'Chapter not found')
    );
  }
  async episode(id: string) {
    return (
      (await this.db.episode.findFirst({
        where: {
          id,
          ...published(),
          chapter: { status: 'published', course: published() },
        },
        include: { chapter: { include: { course: true } } },
      })) ?? fail(404, 'NOT_FOUND', 'Episode not found')
    );
  }
  async allowed(course: { id: string; isPremium: boolean }, userId: string) {
    return (
      !course.isPremium ||
      !!(await this.db.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: course.id } },
      }))
    );
  }
  async require(course: { id: string; isPremium: boolean }, userId: string) {
    if (!(await this.allowed(course, userId)))
      fail(403, 'ENROLLMENT_REQUIRED', 'Enroll in this course first');
  }
}
