import {Module} from '@nestjs/common';
import {ChannelsController} from './channels.controller.js';
import {ChannelsService} from './channels.service.js';
import {CoursesModule} from '../courses/courses.module.js';
@Module({
  imports: [CoursesModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
