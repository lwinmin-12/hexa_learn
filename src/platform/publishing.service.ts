import {Inject, Injectable} from '@nestjs/common';
import {Cron} from '@nestjs/schedule';
import {randomUUID} from 'node:crypto';
import {PrismaService} from '../prisma/prisma.service.js';
import {JobsService} from './jobs.service.js';
@Injectable()
export class PublishingService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}
  @Cron('* * * * *')
  async publish() {
    const key = 'hexa:publish-lock',
      token = randomUUID();
    if ((await this.jobs.redis.set(key, token, 'PX', 55000, 'NX')) !== 'OK')
      return;
    try {
      const now = new Date();
      await this.db.$transaction(
        [
          this.db.course.updateMany({
            where: { status: 'scheduled', publishAt: { lte: now } },
            data: { status: 'published' },
          }),
          this.db.episode.updateMany({
            where: { status: 'scheduled', publishAt: { lte: now } },
            data: { status: 'published' },
          }),
        ],
        { timeout: 15000 },
      );
      // Video visibility is derived from videoScheduledAt <= now at read time.
      // No additional flag or timestamp clearing is needed, and schedule history is preserved.
    } finally {
      await this.jobs.redis.eval(
        "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
        1,
        key,
        token,
      );
    }
  }
}
