import {Inject, Injectable} from '@nestjs/common';
import type { User } from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.js';
import {OwnershipService} from '../platform/ownership.service.js';
import {PageDto, paging, listed, fail} from '../platform/common.js';
import {serial} from '../platform/transaction.js';
import {reorderRows} from '../platform/reorder.js';
import {ReorderDto} from '../admin-content/admin-content.dto.js';
import {QuizDto, UpdateQuizDto, QuestionDto, UpdateQuestionDto, OptionDto, UpdateOptionDto} from './admin-quizzes.dto.js';
@Injectable()
export class AdminQuizzesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(OwnershipService) private readonly scope: OwnershipService,
  ) {}
  private async parent(
    user: User,
    dto: {
      courseId?: string | null;
      chapterId?: string | null;
      episodeId?: string | null;
    },
  ) {
    if (
      [dto.courseId, dto.chapterId, dto.episodeId].filter(Boolean).length !== 1
    )
      fail(
        400,
        'INVALID_QUIZ_PARENT',
        'Exactly one courseId, chapterId or episodeId is required',
      );
    if (dto.courseId) await this.scope.check(user, 'course', dto.courseId);
    else if (dto.chapterId)
      await this.scope.check(user, 'chapter', dto.chapterId);
    else await this.scope.check(user, 'episode', dto.episodeId!);
  }
  async create(user: User, dto: QuizDto) {
    await this.parent(user, dto);
    return this.db.quiz.create({ data: dto });
  }
  async detail(user: User, id: string) {
    await this.scope.check(user, 'quiz', id);
    return this.db.quiz.findUniqueOrThrow({
      where: { id },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          include: { options: { orderBy: { position: 'asc' } } },
        },
      },
    });
  }
  async update(user: User, id: string, dto: UpdateQuizDto) {
    await this.scope.check(user, 'quiz', id);
    const old = await this.db.quiz.findUniqueOrThrow({ where: { id } });
    await this.parent(user, { ...old, ...dto });
    return this.db.quiz.update({ where: { id }, data: dto });
  }
  async delete(user: User, id: string) {
    await this.scope.check(user, 'quiz', id);
    return this.db.quiz.delete({ where: { id } });
  }
  async question(user: User, id: string, dto: QuestionDto) {
    await this.scope.check(user, 'quiz', id);
    if (!dto.options.some((o) => o.isCorrect))
      fail(
        400,
        'MISSING_CORRECT_OPTION',
        'At least one correct option is required',
      );
    return serial(this.db, async (tx) => {
      const max = await tx.quizQuestion.aggregate({
        where: { quizId: id },
        _max: { position: true },
      });
      const { options, ...fields } = dto;
      return tx.quizQuestion.create({
        data: {
          ...fields,
          quizId: id,
          position: dto.position ?? (max._max.position ?? 0) + 1,
          options: {
            create: options.map((o, i) => ({
              ...o,
              position: o.position ?? i + 1,
            })),
          },
        },
        include: { options: true },
      });
    });
  }
  async updateQuestion(user: User, id: string, dto: UpdateQuestionDto) {
    await this.scope.check(user, 'question', id);
    return this.db.quizQuestion.update({ where: { id }, data: dto });
  }
  async deleteQuestion(user: User, id: string) {
    await this.scope.check(user, 'question', id);
    return this.db.quizQuestion.delete({ where: { id } });
  }
  async reorder(user: User, id: string, dto: ReorderDto) {
    await this.scope.check(user, 'quiz', id);
    return serial(this.db, async (tx) =>
      reorderRows(
        await tx.quizQuestion.findMany({
          where: { quizId: id },
          select: { id: true, position: true },
        }),
        dto.ids,
        (id, position) =>
          tx.quizQuestion.update({ where: { id }, data: { position } }),
      ),
    );
  }
  async option(user: User, id: string, dto: OptionDto) {
    await this.scope.check(user, 'question', id);
    return serial(this.db, async (tx) => {
      const max = await tx.quizOption.aggregate({
        where: { questionId: id },
        _max: { position: true },
      });
      return tx.quizOption.create({
        data: {
          ...dto,
          questionId: id,
          position: dto.position ?? (max._max.position ?? 0) + 1,
        },
      });
    });
  }
  async updateOption(user: User, id: string, dto: UpdateOptionDto) {
    await this.scope.check(user, 'option', id);
    return this.db.quizOption.update({ where: { id }, data: dto });
  }
  async deleteOption(user: User, id: string) {
    await this.scope.check(user, 'option', id);
    return this.db.quizOption.delete({ where: { id } });
  }
  async attempts(user: User, id: string, q: PageDto) {
    await this.scope.check(user, 'quiz', id);
    const where = { quizId: id };
    const [data, total, stats, passed, submitted] = await this.db.$transaction([
      this.db.quizAttempt.findMany({
        where,
        ...paging(q),
        orderBy: { startedAt: 'desc' },
        include: { user: { select: { id: true, displayName: true } } },
      }),
      this.db.quizAttempt.count({ where }),
      this.db.quizAttempt.aggregate({
        where: { ...where, submittedAt: { not: null } },
        _avg: { score: true },
      }),
      this.db.quizAttempt.count({ where: { ...where, passed: true } }),
      this.db.quizAttempt.count({
        where: { ...where, submittedAt: { not: null } },
      }),
    ]);
    return {
      ...listed(data, total, q),
      stats: {
        averageScore: stats._avg.score,
        passRate: submitted ? (passed / submitted) * 100 : 0,
      },
    };
  }
}
