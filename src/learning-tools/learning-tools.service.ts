import {Inject, Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service.js';
import {LearningAccessService} from '../courses/access.service.js';
import {StorageService} from '../platform/storage.service.js';
import {PageDto, paging, listed} from '../platform/common.js';
import {AudioQuery} from './learning-tools.dto.js';
@Injectable()
export class LearningToolsService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(LearningAccessService)
    private readonly access: LearningAccessService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}
  private async check(userId: string, id: string) {
    const c = await this.access.chapter(id);
    await this.access.require(c.course, userId);
  }
  async flashcards(userId: string, id: string, q: PageDto) {
    await this.check(userId, id);
    const where = { chapterId: id };
    const [data, total] = await this.db.$transaction([
      this.db.flashcard.findMany({
        where,
        ...paging(q),
        orderBy: { position: 'asc' },
      }),
      this.db.flashcard.count({ where }),
    ]);
    return listed(
      await Promise.all(
        data.map(async (x) => ({
          ...x,
          audioUrl: x.audioUrl ? await this.media(x.audioUrl) : null,
        })),
      ),
      total,
      q,
    );
  }
  async audio(userId: string, id: string, q: AudioQuery) {
    await this.check(userId, id);
    const where = { chapterId: id, type: q.type };
    const [data, total] = await this.db.$transaction([
      this.db.audioTrack.findMany({
        where,
        ...paging(q),
        orderBy: { position: 'asc' },
      }),
      this.db.audioTrack.count({ where }),
    ]);
    return listed(
      await Promise.all(
        data.map(async (x) => ({
          ...x,
          audioUrl: await this.media(x.audioUrl),
        })),
      ),
      total,
      q,
    );
  }
  private media(value: string) {
    return /^https?:\/\//.test(value)
      ? Promise.resolve(value)
      : this.storage.get('MEDIA', value);
  }
}
