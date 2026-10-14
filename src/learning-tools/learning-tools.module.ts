import {Module} from '@nestjs/common';
import {LearningToolsController} from './learning-tools.controller.js';
import {LearningToolsService} from './learning-tools.service.js';
import {CoursesModule} from '../courses/courses.module.js';
@Module({
  imports: [CoursesModule],
  controllers: [LearningToolsController],
  providers: [LearningToolsService],
  exports: [LearningToolsService],
})
export class LearningToolsModule {}
