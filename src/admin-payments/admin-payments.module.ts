import {Module} from '@nestjs/common';
import {AdminPaymentsController} from './admin-payments.controller.js';
import {AdminPaymentsService} from './admin-payments.service.js';

@Module({
  imports: [],
  controllers: [AdminPaymentsController],
  providers: [AdminPaymentsService],
  exports: [AdminPaymentsService],
})
export class AdminPaymentsModule {}
