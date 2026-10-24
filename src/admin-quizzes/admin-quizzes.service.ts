import {Inject, Injectable} from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.js';
import {OwnershipService} from '../platform/ownership.service.js';
import {PageDto, paging, listed, fail} from '../platform/common.js';
import {serial} from '../platform/transaction.js';
import {reorderRows} from '../platform/reorder.js';
import {ReorderDto} from '../admin-content/admin-content.dto.js';
import {QuizDto, UpdateQuizDto, QuestionDto, UpdateQuestionDto, OptionDto, UpdateOptionDto} from './admin-quizzes.dto.js';
import {GlobalQuizQueryDto} from './global-quiz-query.dto.js';
@Injectable()
export class AdminQuizzesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(OwnershipService) private readonly scope: OwnershipService,
  ) {}
  async list(user: User, courseId: string, q: PageDto) {
    await this.scope.check(user, 'course', courseId);
    return this.listFiltered(user, q, { OR: [
      { courseId },
      { chapter: { courseId } },
      { episode: { chapter: { courseId } } },
    ] }, 'title');
  }
  async listAll(user: User, q: GlobalQuizQueryDto) {
    const filters: Prisma.QuizWhereInput[] = [];
    if (user.role === 'page_admin') filters.push({ OR: [
      { course: { ownerId: user.id } },
      { chapter: { course: { ownerId: user.id } } },
      { episode: { chapter: { course: { ownerId: user.id } } } },
    ] });
    if (q.courseId) filters.push({ OR: [
      { courseId: q.courseId },
      { chapter: { courseId: q.courseId } },
      { episode: { chapter: { courseId: q.courseId } } },
    ] });
    if (q.scope) filters.push({ courseId: q.scope === 'course' ? { not: null } : null, chapterId: q.scope === 'chapter' ? { not: null } : q.scope === 'episode' ? null : undefined, episodeId: q.scope === 'episode' ? { not: null } : null });
    if (q.search?.trim()) filters.push({ title: { contains: q.search.trim(), mode: 'insensitive' } });
    return this.listFiltered(user, q, filters.length ? { AND: filters } : {}, q.sort ?? 'newest');
  }
  private async listFiltered(user: User, q: PageDto, where: Prisma.QuizWhereInput, sort: 'newest' | 'title' | 'attempts' | 'passRate') {
    const select = {
          id: true,
          title: true,
          createdAt: true,
          passScore: true,
          timeLimitSec: true,
          course: { select: { id: true, title: true } },
          chapter: { select: { id: true, title: true, position: true, course: { select: { id: true, title: true } } } },
          episode: {
            select: {
              id: true,
              title: true,
              position: true,
              chapter: { select: { id: true, title: true, position: true, course: { select: { id: true, title: true } } } },
            },
          },
          _count: { select: { attempts: true } },
        } satisfies Prisma.QuizSelect;
    const orderBy: Prisma.QuizOrderByWithRelationInput[] = sort === 'newest'
      ? [{ createdAt: 'desc' }, { id: 'desc' }]
      : sort === 'title'
        ? [{ title: 'asc' }, { id: 'asc' }]
        : [{ attempts: { _count: 'desc' } }, { title: 'asc' }, { id: 'asc' }];
    let quizzes: Prisma.QuizGetPayload<{ select: typeof select }>[];
    let total: number;
    if (sort === 'passRate') {
      // shortcut: rank aggregate summaries in memory; move this sort into SQL if quiz counts become large.
      const ids = await this.db.quiz.findMany({ where, select: { id: true } });
      total = ids.length;
      const quizIds = ids.map(({ id }) => id);
      const [submitted, passed] = quizIds.length ? await this.db.$transaction([
        this.db.quizAttempt.groupBy({ by: ['quizId'], where: { quizId: { in: quizIds }, submittedAt: { not: null } }, _count: { id: true } }),
        this.db.quizAttempt.groupBy({ by: ['quizId'], where: { quizId: { in: quizIds }, submittedAt: { not: null }, passed: true }, _count: { id: true } }),
      ]) : [[], []];
      const submissionsByQuiz = new Map(submitted.map((row) => [row.quizId, row._count.id]));
      const passesByQuiz = new Map(passed.map((row) => [row.quizId, row._count.id]));
      const orderedIds = quizIds.sort((left, right) => {
        const leftCount = submissionsByQuiz.get(left) ?? 0;
        const rightCount = submissionsByQuiz.get(right) ?? 0;
        const leftRate = leftCount ? (passesByQuiz.get(left) ?? 0) / leftCount : null;
        const rightRate = rightCount ? (passesByQuiz.get(right) ?? 0) / rightCount : null;
        return leftRate === null ? (rightRate === null ? left.localeCompare(right) : 1) : rightRate === null ? -1 : leftRate - rightRate || left.localeCompare(right);
      });
      const pageIds = orderedIds.slice((q.page - 1) * q.limit, q.page * q.limit);
      const pageRows = pageIds.length ? await this.db.quiz.findMany({ where: { AND: [where, { id: { in: pageIds } }] }, select }) : [];
      const rowsById = new Map(pageRows.map((row) => [row.id, row]));
      quizzes = pageIds.flatMap((id) => { const row = rowsById.get(id); return row ? [row] : []; });
    } else {
      [quizzes, total] = await this.db.$transaction([
        this.db.quiz.findMany({ where, ...paging(q), orderBy, select }),
        this.db.quiz.count({ where }),
      ]);
    }
    if (!quizzes.length) return listed([], total, q);
    const ids = quizzes.map((quiz) => quiz.id);
    const [questions, submitted, passed] = await this.db.$transaction([
      this.db.quizQuestion.groupBy({
        by: ['quizId'],
        where: { quizId: { in: ids } },
        _count: { id: true },
        _sum: { points: true },
      }),
      this.db.quizAttempt.groupBy({
        by: ['quizId'],
        where: { quizId: { in: ids }, submittedAt: { not: null } },
        _count: { id: true },
        _avg: { score: true },
      }),
      this.db.quizAttempt.groupBy({
        by: ['quizId'],
        where: {
          quizId: { in: ids },
          submittedAt: { not: null },
          passed: true,
        },
        _count: { id: true },
      }),
    ]);
    const questionsByQuiz = new Map(questions.map((row) => [row.quizId, row]));
    const submittedByQuiz = new Map(submitted.map((row) => [row.quizId, row]));
    const passedByQuiz = new Map(passed.map((row) => [row.quizId, row._count.id]));
    const data = quizzes.map((quiz) => {
      const question = questionsByQuiz.get(quiz.id);
      const submission = submittedByQuiz.get(quiz.id);
      const summary = {
        id: quiz.id,
        title: quiz.title,
        passScore: quiz.passScore,
        timeLimitSec: quiz.timeLimitSec,
        questionCount: question?._count.id ?? 0,
        totalPoints: question?._sum.points ?? 0,
        attemptCount: quiz._count.attempts,
        passRate: submission
          ? ((passedByQuiz.get(quiz.id) ?? 0) / submission._count.id) * 100
          : null,
        averageScore: submission?._avg.score ?? null,
      };
      const course = quiz.course ?? quiz.chapter?.course ?? quiz.episode?.chapter.course;
      if (quiz.course)
        return {
          ...summary,
          scope: 'course',
          attachedTo: { type: 'course', ...quiz.course },
          course,
        };
      if (quiz.chapter)
        return {
          ...summary,
          scope: 'chapter',
          attachedTo: {
            type: 'chapter',
            id: quiz.chapter.id,
            title: quiz.chapter.title,
            chapterId: quiz.chapter.id,
            chapterTitle: quiz.chapter.title,
            chapterPosition: quiz.chapter.position,
          },
          course,
        };
      if (quiz.episode)
        return {
          ...summary,
          scope: 'episode',
          attachedTo: {
            type: 'episode',
            id: quiz.episode.id,
            title: quiz.episode.title,
            chapterId: quiz.episode.chapter.id,
            chapterTitle: quiz.episode.chapter.title,
            chapterPosition: quiz.episode.chapter.position,
            episodePosition: quiz.episode.position,
          },
          course,
        };
      return fail(500, 'INVALID_QUIZ_PARENT', 'Quiz has no attachment');
    });
    return listed(data, total, q);
  }
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
