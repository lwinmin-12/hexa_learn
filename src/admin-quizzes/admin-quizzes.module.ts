import {Module} from '@nestjs/common';
import {AdminQuizzesController} from './admin-quizzes.controller.js';
import {AdminQuizzesService} from './admin-quizzes.service.js';

@Module({
  imports: [],
  controllers: [AdminQuizzesController],
  providers: [AdminQuizzesService],
  exports: [AdminQuizzesService],
})
export class AdminQuizzesModule {}
