import {Inject, Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service.js';
import {LearningAccessService} from '../courses/access.service.js';
import {published, fail} from '../platform/common.js';
import {serial} from '../platform/transaction.js';
import {ProgressDto} from '../courses/courses.dto.js';
export const percent = (done: number, total: number) =>
  total ? Math.round((done / total) * 10000) / 100 : 0;
@Injectable()
export class ProgressService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(LearningAccessService)
    private readonly access: LearningAccessService,
  ) {}
  async course(userId: string, id: string) {
    await this.access.course(id);
    const chapters = await this.db.chapter.findMany({
      where: { courseId: id, status: 'published' },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        title: true,
        episodes: {
          where: published(),
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            progress: {
              where: { userId },
              select: { watchedSec: true, isCompleted: true },
            },
          },
        },
      },
    });
    let total = 0,
      done = 0;
    const data = chapters.map((c) => {
      const episodes = c.episodes.map((e) => ({
        id: e.id,
        title: e.title,
        watchedSec: e.progress[0]?.watchedSec ?? 0,
        isCompleted: e.progress[0]?.isCompleted ?? false,
      }));
      const completed = episodes.filter((e) => e.isCompleted).length;
      total += episodes.length;
      done += completed;
      return {
        id: c.id,
        title: c.title,
        progressPct: percent(completed, episodes.length),
        episodes,
      };
    });
    return { courseId: id, progressPct: percent(done, total), chapters: data };
  }
  async resume(userId: string, id: string) {
    const e = await this.access.episode(id);
    await this.access.require(e.chapter.course, userId);
    return (
      (await this.db.episodeProgress.findUnique({
        where: { userId_episodeId: { userId, episodeId: id } },
      })) ?? { episodeId: id, watchedSec: 0, isCompleted: false }
    );
  }
  async save(userId: string, id: string, dto: ProgressDto) {
    const episode = await this.access.episode(id);
    await this.access.require(episode.chapter.course, userId);
    const courseId = episode.chapter.courseId;
    return serial(this.db, async (tx) => {
      const enrollment = await tx.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
      });
      if (!enrollment)
        fail(403, 'ENROLLMENT_REQUIRED', 'Enroll before tracking progress');
      const old = await tx.episodeProgress.findUnique({
        where: { userId_episodeId: { userId, episodeId: id } },
      });
      const watchedSec = Math.max(old?.watchedSec ?? 0, dto.watchedSec);
      const isCompleted =
        !!old?.isCompleted ||
        dto.isCompleted === true ||
        (episode.videoDurationSec !== null &&
          episode.videoDurationSec > 0 &&
          watchedSec >= episode.videoDurationSec * 0.9);
      const result = await tx.episodeProgress.upsert({
        where: { userId_episodeId: { userId, episodeId: id } },
        create: { userId, episodeId: id, watchedSec, isCompleted },
        update: { watchedSec, isCompleted },
      });
      const where = {
        ...published(),
        chapter: { courseId, status: 'published' as const },
      };
      const total = await tx.episode.count({ where });
      const done = await tx.episodeProgress.count({
        where: { userId, isCompleted: true, episode: where },
      });
      const progressPct = percent(done, total);
      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: {
          progressPct,
          ...(total > 0 && done === total
            ? {
                status: 'completed',
                completedAt: enrollment.completedAt ?? new Date(),
              }
            : {}),
        },
      });
      return result;
    });
  }
}
