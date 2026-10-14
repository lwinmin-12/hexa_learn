import {Module} from '@nestjs/common';
import {PaymentsController} from './payments.controller.js';
import {PaymentsService} from './payments.service.js';
import {CoursesModule} from '../courses/courses.module.js';
@Module({
  imports: [CoursesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
