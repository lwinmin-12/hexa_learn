import {Inject, Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service.js';
import {FcmService} from '../platform/jobs.service.js';
@Injectable()
export class NotificationDeliveryService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FcmService) private readonly fcm: FcmService,
  ) {}
  async message(id: string) {
    const message = await this.db.channelMessage.findUnique({
      where: { id },
      include: { channel: true },
    });
    if (!message) return;
    let cursor: string | undefined;
    for (;;) {
      const members = await this.db.channelMember.findMany({
        where: {
          channelId: message.channelId,
          isMuted: false,
          ...(cursor ? { userId: { gt: cursor } } : {}),
        },
        orderBy: { userId: 'asc' },
        take: 500,
        select: { userId: true },
      });
      if (!members.length) break;
      await this.db.notification.createMany({
        data: members.map((m) => ({ userId: m.userId, messageId: id })),
        skipDuplicates: true,
      });
      await this.fcm.send(
        members.map((m) => m.userId),
        message.title,
        message.body,
        { messageId: id, courseId: message.channel.courseId },
      );
      cursor = members[members.length - 1].userId;
    }
  }
}
