import {Inject, Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service.js';
import {LearningAccessService} from '../courses/access.service.js';
import {PageDto, fail, paging, listed} from '../platform/common.js';
import {MuteDto} from './channels.dto.js';
@Injectable()
export class ChannelsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(LearningAccessService)
    private readonly access: LearningAccessService,
  ) {}
  async course(userId: string, id: string) {
    await this.access.course(id);
    if (
      !(await this.db.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: id } },
      }))
    )
      fail(403, 'ENROLLMENT_REQUIRED', 'Enroll before accessing the channel');
    return (
      (await this.db.channel.findUnique({ where: { courseId: id } })) ??
      fail(404, 'NOT_FOUND', 'Channel not found')
    );
  }
  async channel(userId: string, id: string) {
    const c = await this.db.channel.findUnique({ where: { id } });
    if (!c) fail(404, 'NOT_FOUND', 'Channel not found');
    await this.course(userId, c.courseId);
    return c;
  }
  async join(userId: string, id: string) {
    await this.channel(userId, id);
    return this.db.channelMember.upsert({
      where: { channelId_userId: { channelId: id, userId } },
      create: { channelId: id, userId },
      update: {},
    });
  }
  async leave(userId: string, id: string) {
    await this.channel(userId, id);
    await this.db.channelMember.deleteMany({
      where: { channelId: id, userId },
    });
    return { joined: false };
  }
  async mute(userId: string, id: string, dto: MuteDto) {
    await this.channel(userId, id);
    return this.db.channelMember.update({
      where: { channelId_userId: { channelId: id, userId } },
      data: dto,
    });
  }
  async messages(userId: string, id: string, q: PageDto) {
    await this.channel(userId, id);
    if (
      !(await this.db.channelMember.findUnique({
        where: { channelId_userId: { channelId: id, userId } },
      }))
    )
      fail(403, 'MEMBERSHIP_REQUIRED', 'Join the channel first');
    const where = { channelId: id };
    const [data, total] = await this.db.$transaction([
      this.db.channelMessage.findMany({
        where,
        ...paging(q),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.channelMessage.count({ where }),
    ]);
    return listed(data, total, q);
  }
}
