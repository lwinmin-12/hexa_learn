import {Inject, Injectable} from '@nestjs/common';
import {LearningAccessService} from '../courses/access.service.js';
import {ProgressService} from '../progress/progress.service.js';
import {PageDto,listed} from '../platform/common.js';
import {StorageService} from '../platform/storage.service.js';
@Injectable()
export class ChaptersEpisodesService {
  constructor(
    @Inject(LearningAccessService)
    private readonly access: LearningAccessService,
    @Inject(ProgressService) private readonly progress: ProgressService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}
  async chapters(userId: string, id: string, q:PageDto) {
    const chapters=(await this.progress.course(userId, id)).chapters;
    return listed(chapters.slice((q.page-1)*q.limit,q.page*q.limit),chapters.length,q);
  }
  async chapter(userId: string, id: string) {
    const c = await this.access.chapter(id);
    const data = await this.progress.course(userId, c.courseId);
    return data.chapters.find((c) => c.id === id);
  }
  async episode(userId: string, id: string) {
    const e = await this.access.episode(id);
    const { videoUrl, chapter, ...metadata } = e;
    const allowed = await this.access.allowed(chapter.course, userId);
    const visible =
      e.videoUploadStatus === 'ready' &&
      (!e.videoScheduledAt || e.videoScheduledAt <= new Date());
    return {
      ...metadata,
      courseId: chapter.courseId,
      locked: !allowed,
      ...(allowed && visible && videoUrl
        ? { videoUrl: await this.storage.get('VIDEOS', videoUrl) }
        : {}),
    };
  }
}
