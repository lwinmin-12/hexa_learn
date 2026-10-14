import {Module} from '@nestjs/common';
import {AdminLearningToolsController} from './admin-learning-tools.controller.js';
import {AdminLearningToolsService} from './admin-learning-tools.service.js';

@Module({
  imports: [],
  controllers: [AdminLearningToolsController],
  providers: [AdminLearningToolsService],
  exports: [AdminLearningToolsService],
})
export class AdminLearningToolsModule {}
