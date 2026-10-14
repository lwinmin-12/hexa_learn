import {Module} from '@nestjs/common';
import {QuizzesController} from './quizzes.controller.js';
import {QuizzesService} from './quizzes.service.js';
import {CoursesModule} from '../courses/courses.module.js';
@Module({
  imports: [CoursesModule],
  controllers: [QuizzesController],
  providers: [QuizzesService],
  exports: [QuizzesService],
})
export class QuizzesModule {}
