import {Module} from '@nestjs/common';
import {AdminContentController} from './admin-content.controller.js';
import {AdminContentService} from './admin-content.service.js';

@Module({
  imports: [],
  controllers: [AdminContentController],
  providers: [AdminContentService],
  exports: [AdminContentService],
})
export class AdminContentModule {}
