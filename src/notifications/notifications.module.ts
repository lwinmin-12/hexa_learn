import {NotificationDeliveryService} from './notification-delivery.service.js';
import {Module} from '@nestjs/common';
import {NotificationsController} from './notifications.controller.js';
import {NotificationsService} from './notifications.service.js';

@Module({
  imports: [],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationDeliveryService],
  exports: [NotificationsService, NotificationDeliveryService],
})
export class NotificationsModule {}
