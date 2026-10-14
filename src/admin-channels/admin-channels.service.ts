import {Inject, Injectable} from '@nestjs/common';
import type { User } from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service.js';
import {OwnershipService} from '../platform/ownership.service.js';
import {JobsService} from '../platform/jobs.service.js';
import {PageDto, paging, listed} from '../platform/common.js';
import {ChannelDto, MessageDto} from '../channels/channels.dto.js';
@Injectable()
export class AdminChannelsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(OwnershipService) private readonly scope: OwnershipService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}
  async course(user: User, id: string) {
    const c = await this.scope.check(user, 'course', id);
    return this.db.channel.upsert({
      where: { courseId: id },
      create: { courseId: id, name: c.title },
      update: {},
    });
  }
  async update(user: User, id: string, dto: ChannelDto) {
    await this.scope.check(user, 'channel', id);
    return this.db.channel.update({ where: { id }, data: dto });
  }
  async members(user: User, id: string, q: PageDto) {
    await this.scope.check(user, 'channel', id);
    const where = { channelId: id };
    const [data, total] = await this.db.$transaction([
      this.db.channelMember.findMany({
        where,
        ...paging(q),
        orderBy: { joinedAt: 'desc' },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      }),
      this.db.channelMember.count({ where }),
    ]);
    return listed(data, total, q);
  }
  async remove(user: User, id: string, userId: string) {
    await this.scope.check(user, 'channel', id);
    return this.db.channelMember.deleteMany({
      where: { channelId: id, userId },
    });
  }
  async send(user: User, id: string, dto: MessageDto) {
    await this.scope.check(user, 'channel', id);
    const message = await this.db.channelMessage.create({
      data: { channelId: id, senderId: user.id, ...dto },
    });
    await this.jobs.add(
      'channel-message',
      { messageId: message.id },
      `message-${message.id}`,
    );
    return message;
  }
  async messages(user: User, id: string, q: PageDto) {
    await this.scope.check(user, 'channel', id);
    const where = { channelId: id };
    const [data, total] = await this.db.$transaction([
      this.db.channelMessage.findMany({
        where,
        ...paging(q),
        orderBy: { createdAt: 'desc' },
      }),
      this.db.channelMessage.count({ where }),
    ]);
    return listed(data, total, q);
  }
  async delete(user: User, id: string) {
    await this.scope.check(user, 'message', id);
    return this.db.channelMessage.delete({ where: { id } });
  }
}
