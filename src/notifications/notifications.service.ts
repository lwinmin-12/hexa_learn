import {Inject, Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service.js';
import {paging, listed, fail} from '../platform/common.js';
import {NotificationQuery} from '../channels/channels.dto.js';
@Injectable()
export class NotificationsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  async list(userId: string, q: NotificationQuery) {
    const where = { userId, ...(q.unread === true ? { readAt: null } : {}) };
    const [data, total] = await this.db.$transaction([
      this.db.notification.findMany({
        where,
        ...paging(q),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        include: {
          message: {
            select: {
              id: true,
              title: true,
              body: true,
              channel: {
                select: { course: { select: { id: true, title: true } } },
              },
            },
          },
        },
      }),
      this.db.notification.count({ where }),
    ]);
    return listed(data, total, q);
  }
  async read(userId: string, id: string) {
    const n = await this.db.notification.findFirst({ where: { id, userId } });
    if (!n) fail(404, 'NOT_FOUND', 'Notification not found');
    return this.db.notification.update({
      where: { id },
      data: { readAt: n.readAt ?? new Date() },
    });
  }
  async all(userId: string) {
    return this.db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
  async count(userId: string) {
    return {
      count: await this.db.notification.count({
        where: { userId, readAt: null },
      }),
    };
  }
}
