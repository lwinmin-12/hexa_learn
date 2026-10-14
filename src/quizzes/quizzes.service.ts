import {Inject, Injectable} from '@nestjs/common';
import type { Quiz } from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.js';
import {LearningAccessService} from '../courses/access.service.js';
import {PageDto, paging, listed, fail} from '../platform/common.js';
import {serial} from '../platform/transaction.js';
import {SubmitDto} from './quizzes.dto.js';
export function correctSet(selected: string[], correct: string[]) {
  return (
    correct.length > 0 &&
    selected.length === correct.length &&
    new Set(selected).size === selected.length &&
    selected.every((id) => correct.includes(id))
  );
}
@Injectable()
export class QuizzesService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(LearningAccessService)
    private readonly access: LearningAccessService,
  ) {}
  async parent(
    q: Pick<Quiz, 'courseId' | 'chapterId' | 'episodeId'>,
    userId: string,
  ) {
    const course = q.courseId
      ? await this.access.course(q.courseId)
      : q.chapterId
        ? (await this.access.chapter(q.chapterId)).course
        : (await this.access.episode(q.episodeId!)).chapter.course;
    await this.access.require(course, userId);
    return course;
  }
  async list(
    userId: string,
    kind: 'courseId' | 'chapterId' | 'episodeId',
    id: string,
    q: PageDto,
  ) {
    await this.parent(
      { courseId: null, chapterId: null, episodeId: null, [kind]: id },
      userId,
    );
    const where = { [kind]: id };
    const [data, total] = await this.db.$transaction([
      this.db.quiz.findMany({ where, ...paging(q), orderBy: { id: 'asc' } }),
      this.db.quiz.count({ where }),
    ]);
    return listed(data, total, q);
  }
  async detail(userId: string, id: string) {
    const q = await this.db.quiz.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            questionText: true,
            position: true,
            points: true,
            options: {
              orderBy: { position: 'asc' },
              select: { id: true, optionText: true, position: true },
            },
          },
        },
      },
    });
    if (!q) fail(404, 'NOT_FOUND', 'Quiz not found');
    await this.parent(q, userId);
    return q;
  }
  async start(userId: string, id: string) {
    const q = await this.db.quiz.findUnique({ where: { id } });
    if (!q) fail(404, 'NOT_FOUND', 'Quiz not found');
    await this.parent(q, userId);
    return this.db.quizAttempt.create({ data: { userId, quizId: id } });
  }
  async submit(userId: string, id: string, dto: SubmitDto) {
    return serial(this.db, async (tx) => {
      const attempt = await tx.quizAttempt.findFirst({
        where: { id, userId },
        include: {
          quiz: { include: { questions: { include: { options: true } } } },
        },
      });
      if (!attempt) fail(404, 'NOT_FOUND', 'Attempt not found');
      if (attempt.submittedAt)
        fail(409, 'ALREADY_SUBMITTED', 'Attempt already submitted');
      if (
        attempt.quiz.timeLimitSec !== null &&
        Date.now() >
          attempt.startedAt.getTime() + (attempt.quiz.timeLimitSec + 10) * 1000
      )
        fail(409, 'TIME_LIMIT_EXCEEDED', 'Attempt time limit exceeded');
      const seen = new Set<string>();
      let score = 0;
      const rows: {
        attemptId: string;
        questionId: string;
        optionId: string;
        isCorrect: boolean;
      }[] = [];
      for (const answer of dto.answers) {
        if (seen.has(answer.questionId))
          fail(400, 'DUPLICATE_QUESTION', 'Question answered more than once');
        seen.add(answer.questionId);
        const question = attempt.quiz.questions.find(
          (q) => q.id === answer.questionId,
        );
        if (!question)
          fail(400, 'INVALID_QUESTION', 'Question does not belong to quiz');
        if (
          new Set(answer.optionIds).size !== answer.optionIds.length ||
          answer.optionIds.some(
            (id) => !question.options.some((o) => o.id === id),
          )
        )
          fail(
            400,
            'INVALID_OPTIONS',
            'Options must belong to question and be unique',
          );
        const correct = correctSet(
          answer.optionIds,
          question.options.filter((o) => o.isCorrect).map((o) => o.id),
        );
        if (correct) score += question.points;
        rows.push(
          ...answer.optionIds.map((optionId) => ({
            attemptId: id,
            questionId: question.id,
            optionId,
            isCorrect: correct,
          })),
        );
      }
      if (rows.length) await tx.quizAnswer.createMany({ data: rows });
      return tx.quizAttempt.update({
        where: { id },
        data: {
          score,
          passed: score >= attempt.quiz.passScore,
          submittedAt: new Date(),
        },
      });
    });
  }
  async review(userId: string, id: string) {
    const a = await this.db.quizAttempt.findFirst({
      where: { id, userId },
      include: {
        answers: true,
        quiz: {
          include: {
            questions: {
              orderBy: { position: 'asc' },
              include: { options: { orderBy: { position: 'asc' } } },
            },
          },
        },
      },
    });
    if (!a) fail(404, 'NOT_FOUND', 'Attempt not found');
    if (!a.submittedAt)
      fail(409, 'NOT_SUBMITTED', 'Submit the attempt before reviewing answers');
    return a;
  }
  async history(userId: string, id: string, q: PageDto) {
    await this.detail(userId, id);
    const where = { userId, quizId: id };
    const [data, total] = await this.db.$transaction([
      this.db.quizAttempt.findMany({
        where,
        ...paging(q),
        orderBy: { startedAt: 'desc' },
      }),
      this.db.quizAttempt.count({ where }),
    ]);
    return listed(data, total, q);
  }
}
