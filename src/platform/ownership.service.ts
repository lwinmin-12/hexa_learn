import {Inject, Injectable} from '@nestjs/common';
import type { User } from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.js';
import {fail} from './common.js';
export type Target =
  | 'course'
  | 'chapter'
  | 'episode'
  | 'quiz'
  | 'question'
  | 'option'
  | 'flashcard'
  | 'audio'
  | 'channel'
  | 'message'
  | 'payment'
  | 'promo';
@Injectable()
export class OwnershipService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async courseId(kind: Target, id: string): Promise<string> {
    if (kind === 'course') {
      const c = await this.db.course.findUnique({
        where: { id },
        select: { id: true },
      });
      return c?.id ?? fail(404, 'NOT_FOUND', 'Course not found');
    }
    if (kind === 'chapter')
      return (
        (
          await this.db.chapter.findUnique({
            where: { id },
            select: { courseId: true },
          })
        )?.courseId ?? fail(404, 'NOT_FOUND', 'Chapter not found')
      );
    if (kind === 'episode') {
      const e = await this.db.episode.findUnique({
        where: { id },
        select: { chapter: { select: { courseId: true } } },
      });
      return e?.chapter.courseId ?? fail(404, 'NOT_FOUND', 'Episode not found');
    }
    if (kind === 'quiz') {
      const q = await this.db.quiz.findUnique({ where: { id } });
      if (!q) return fail(404, 'NOT_FOUND', 'Quiz not found');
      return (
        q.courseId ??
        (q.chapterId
          ? this.courseId('chapter', q.chapterId)
          : this.courseId('episode', q.episodeId!))
      );
    }
    if (kind === 'question') {
      const q = await this.db.quizQuestion.findUnique({ where: { id } });
      return q
        ? this.courseId('quiz', q.quizId)
        : fail(404, 'NOT_FOUND', 'Question not found');
    }
    if (kind === 'option') {
      const q = await this.db.quizOption.findUnique({ where: { id } });
      return q
        ? this.courseId('question', q.questionId)
        : fail(404, 'NOT_FOUND', 'Option not found');
    }
    if (kind === 'flashcard') {
      const q = await this.db.flashcard.findUnique({ where: { id } });
      return q
        ? this.courseId('chapter', q.chapterId)
        : fail(404, 'NOT_FOUND', 'Flashcard not found');
    }
    if (kind === 'audio') {
      const q = await this.db.audioTrack.findUnique({ where: { id } });
      return q
        ? this.courseId('chapter', q.chapterId)
        : fail(404, 'NOT_FOUND', 'Audio not found');
    }
    if (kind === 'channel')
      return (
        (await this.db.channel.findUnique({ where: { id } }))?.courseId ??
        fail(404, 'NOT_FOUND', 'Channel not found')
      );
    if (kind === 'message') {
      const q = await this.db.channelMessage.findUnique({ where: { id } });
      return q
        ? this.courseId('channel', q.channelId)
        : fail(404, 'NOT_FOUND', 'Message not found');
    }
    if (kind === 'payment')
      return (
        (await this.db.payment.findUnique({ where: { id } }))?.courseId ??
        fail(404, 'NOT_FOUND', 'Payment not found')
      );
    return (
      (await this.db.promoCode.findUnique({ where: { id } }))?.courseId ??
      fail(404, 'NOT_FOUND', 'Course promo not found')
    );
  }
  async check(user: User, kind: Target, id: string) {
    const courseId = await this.courseId(kind, id);
    const course = await this.db.course.findFirst({
      where: {
        id: courseId,
        ...(user.role === 'super_admin' ? {} : { ownerId: user.id }),
      },
    });
    return course ?? fail(404, 'NOT_FOUND', 'Course not found');
  }
  filter(user: User) {
    return user.role === 'super_admin' ? {} : { ownerId: user.id };
  }
}
