import {Inject, Injectable} from '@nestjs/common';
import {Prisma, User} from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.js';
import {OwnershipService} from '../platform/ownership.service.js';
import {PageDto, paging, listed, fail} from '../platform/common.js';
import {RevenueQuery} from './admin-dashboard.dto.js';
@Injectable()
export class AdminDashboardService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(OwnershipService) private readonly scope: OwnershipService,
  ) {}
  async summary(user: User) {
    const course = this.scope.filter(user);
    const [totalLearners, totalCourses, revenue, pendingPayments] =
      await this.db.$transaction([
        this.db.user.count({ where: { enrollments: { some: { course } } } }),
        this.db.course.count({ where: course }),
        this.db.payment.aggregate({
          where: { course, status: 'approved' },
          _sum: { finalAmount: true },
        }),
        this.db.payment.count({ where: { course, status: 'slip_uploaded' } }),
      ]);
    return {
      totalLearners,
      totalCourses,
      totalRevenue: revenue._sum.finalAmount?.toString() ?? '0',
      pendingPayments,
    };
  }
  async revenue(user: User, q: RevenueQuery) {
    const from = new Date(q.from),
      to = new Date(q.to);
    if (to < from || to.getTime() - from.getTime() > 366 * 86400000)
      fail(
        400,
        'INVALID_DATE_RANGE',
        'Date range must be ordered and no longer than 366 days',
      );
    const rows = await this.db.payment.groupBy({
      by: ['reviewedAt'],
      where: {
        course: this.scope.filter(user),
        status: 'approved',
        reviewedAt: { gte: from, lte: to },
      },
      _sum: { finalAmount: true },
      orderBy: { reviewedAt: 'asc' },
    });
    const days = new Map<string, Prisma.Decimal>();
    for (const row of rows)
      if (row.reviewedAt) {
        const day = row.reviewedAt.toISOString().slice(0, 10);
        days.set(
          day,
          (days.get(day) ?? new Prisma.Decimal(0)).plus(
            row._sum.finalAmount ?? 0,
          ),
        );
      }
    return {
      data: [...days].map(([date, revenue]) => ({
        date,
        revenue: revenue.toString(),
      })),
    };
  }
  async top(user: User) {
    const counts = await this.db.enrollment.groupBy({
      by: ['courseId'],
      where: { course: this.scope.filter(user) },
      _count: { courseId: true },
      orderBy: { _count: { courseId: 'desc' } },
      take: 10,
    });
    const ids = counts.map((c) => c.courseId);
    const [courses, revenue] = await this.db.$transaction([
      this.db.course.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true },
      }),
      this.db.payment.groupBy({
        by: ['courseId'],
        where: { courseId: { in: ids }, status: 'approved' },
        _sum: { finalAmount: true },
      }),
    ]);
    return {
      data: counts.map((c) => ({
        courseId: c.courseId,
        title: courses.find((x) => x.id === c.courseId)?.title,
        enrollmentCount: c._count.courseId,
        revenue:
          revenue
            .find((x) => x.courseId === c.courseId)
            ?._sum.finalAmount?.toString() ?? '0',
      })),
    };
  }
  async learners(user: User, id: string, q: PageDto) {
    await this.scope.check(user, 'course', id);
    const where = { courseId: id };
    const [data, total] = await this.db.$transaction([
      this.db.enrollment.findMany({
        where,
        ...paging(q),
        orderBy: { enrolledAt: 'desc' },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      }),
      this.db.enrollment.count({ where }),
    ]);
    return listed(data, total, q);
  }
  async stats(user: User, id: string) {
    await this.scope.check(user, 'course', id);
    const [enrollmentCount, completed, average, quizzes] =
      await this.db.$transaction([
        this.db.enrollment.count({ where: { courseId: id } }),
        this.db.enrollment.count({
          where: { courseId: id, status: 'completed' },
        }),
        this.db.enrollment.aggregate({
          where: { courseId: id },
          _avg: { progressPct: true },
        }),
        this.db.quiz.findMany({
          where: {
            OR: [
              { courseId: id },
              { chapter: { courseId: id } },
              { episode: { chapter: { courseId: id } } },
            ],
          },
          select: { id: true, title: true },
        }),
      ]);
    const ids = quizzes.map((q) => q.id);
    const [scores, passed] = await this.db.$transaction([
      this.db.quizAttempt.groupBy({
        by: ['quizId'],
        where: { quizId: { in: ids }, submittedAt: { not: null } },
        _avg: { score: true },
        _count: { id: true },
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
    return {
      enrollmentCount,
      completionRate: enrollmentCount ? (completed / enrollmentCount) * 100 : 0,
      averageProgressPct: average._avg.progressPct?.toString() ?? '0',
      quizzes: quizzes.map((q) => {
        const score = scores.find((s) => s.quizId === q.id);
        const pass = passed.find((s) => s.quizId === q.id);
        return {
          ...q,
          averageScore: score?._avg.score ?? null,
          passRate: score
            ? ((pass?._count.id ?? 0) / score._count.id) * 100
            : 0,
        };
      }),
    };
  }
  async scheduled(user: User, q: PageDto) {
    const schema=Prisma.raw(`"${this.db.databaseSchema.replaceAll('"','""')}"`);
    const scope=user.role==='super_admin'?Prisma.sql`TRUE`:Prisma.sql`c.owner_id = ${user.id}::uuid`;
    const upcoming=Prisma.sql`
      SELECT c.id, c.title, 'course' AS type, c.publish_at AS "scheduledAt"
      FROM ${schema}.courses c WHERE ${scope} AND c.status = 'scheduled'
      UNION ALL
      SELECT e.id, e.title, 'episode' AS type,
        CASE WHEN e.status = 'scheduled' THEN LEAST(e.publish_at, e.video_scheduled_at)
             ELSE e.video_scheduled_at END AS "scheduledAt"
      FROM ${schema}.episodes e
      JOIN ${schema}.chapters ch ON ch.id = e.chapter_id
      JOIN ${schema}.courses c ON c.id = ch.course_id
      WHERE ${scope} AND (e.status = 'scheduled' OR e.video_scheduled_at > NOW())`;
    const [data,total]=await this.db.$transaction([
      this.db.$queryRaw<{id:string;title:string;type:string;scheduledAt:Date|null}[]>(Prisma.sql`
        SELECT * FROM (${upcoming}) upcoming ORDER BY "scheduledAt" ASC NULLS LAST, id ASC
        LIMIT ${q.limit} OFFSET ${(q.page-1)*q.limit}`),
      this.db.$queryRaw<{total:bigint}[]>(Prisma.sql`SELECT COUNT(*) AS total FROM (${upcoming}) upcoming`),
    ]);
    return listed(data,Number(total[0].total),q);
  }
}
