import {Inject, Injectable, OnModuleDestroy} from '@nestjs/common';
import {Queue} from 'bullmq';
import {Redis} from 'ioredis';
import {getApp} from 'firebase-admin/app';
import {getMessaging} from 'firebase-admin/messaging';
import {PrismaService} from '../prisma/prisma.service.js';
export const redisOptions = () => {
  const u = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: Number(u.pathname.slice(1) || 0),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
};
@Injectable()
export class JobsService implements OnModuleDestroy {
  readonly redis = new Redis({
    ...redisOptions(),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  readonly queue = new Queue('hexa-learning', {
    connection: redisOptions(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
  async add(name: string, data: unknown, id?: string) {
    return this.queue.add(name, data, { jobId: id });
  }
  async onModuleDestroy() {
    await this.queue.close();
    this.redis.disconnect();
  }
}
@Injectable()
export class FcmService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async send(
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, string> = {},
  ) {
    const tokens = await this.db.deviceToken.findMany({
      where: { userId: { in: userIds } },
      select: { fcmToken: true },
    });
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500).map((t) => t.fcmToken);
      const result = await getMessaging(
        getApp('hexa-auth'),
      ).sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        data,
      });
      const invalid = result.responses.flatMap((r, j) =>
        r.error?.code === 'messaging/registration-token-not-registered'
          ? [batch[j]]
          : [],
      );
      if (invalid.length)
        await this.db.deviceToken.deleteMany({
          where: { fcmToken: { in: invalid } },
        });
      if (
        result.responses.some(
          (r) =>
            !r.success &&
            r.error?.code !== 'messaging/registration-token-not-registered',
        )
      )
        throw new Error('FCM delivery failed; retry');
    }
  }
}
