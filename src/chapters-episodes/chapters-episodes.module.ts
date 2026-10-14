import {Module} from '@nestjs/common';
import {ChaptersEpisodesController} from './chapters-episodes.controller.js';
import {ChaptersEpisodesService} from './chapters-episodes.service.js';
import {CoursesModule} from '../courses/courses.module.js';
import {ProgressModule} from '../progress/progress.module.js';
@Module({
  imports: [CoursesModule, ProgressModule],
  controllers: [ChaptersEpisodesController],
  providers: [ChaptersEpisodesService],
  exports: [ChaptersEpisodesService],
})
export class ChaptersEpisodesModule {}
