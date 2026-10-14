import {Module} from '@nestjs/common';
import {AdminChannelsController} from './admin-channels.controller.js';
import {AdminChannelsService} from './admin-channels.service.js';

@Module({
  imports: [],
  controllers: [AdminChannelsController],
  providers: [AdminChannelsService],
  exports: [AdminChannelsService],
})
export class AdminChannelsModule {}
