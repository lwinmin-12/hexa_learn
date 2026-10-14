import {Module} from '@nestjs/common';
import {CoursesController} from './courses.controller.js';
import {CoursesService} from './courses.service.js';
import {LearningAccessService} from './access.service.js';
@Module({
  imports: [],
  controllers: [CoursesController],
  providers: [CoursesService, LearningAccessService],
  exports: [CoursesService, LearningAccessService],
})
export class CoursesModule {}
