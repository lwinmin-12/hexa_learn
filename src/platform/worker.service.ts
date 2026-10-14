import {Inject, Injectable, OnModuleInit, OnModuleDestroy, Logger} from '@nestjs/common';
import {Worker} from 'bullmq';
import {redisOptions, FcmService} from './jobs.service.js';
import {StorageService, Bucket} from './storage.service.js';
import {NotificationDeliveryService} from '../notifications/notification-delivery.service.js';
@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  constructor(
    @Inject(NotificationDeliveryService)
    private readonly delivery: NotificationDeliveryService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(FcmService) private readonly fcm: FcmService,
  ) {}
  onModuleInit() {
    this.worker = new Worker(
      'hexa-learning',
      async (job) => {
        if (job.name === 'channel-message')
          await this.delivery.message(job.data.messageId);
        else if (job.name === 'payment-approved')
          await this.fcm.send(
            [job.data.userId],
            'Payment approved',
            'Your course is ready to learn',
            { courseId: job.data.courseId, paymentId: job.data.paymentId },
          );
        else if (job.name === 'storage-cleanup')
          for (const item of job.data.objects as {
            bucket: Bucket;
            key: string;
          }[])
            if (!/^https?:\/\//.test(item.key))
              await this.storage.delete(item.bucket, item.key);
      },
      { connection: redisOptions(), concurrency: 5 },
    );
    this.worker.on('error', () =>
      Logger.error('Learning queue connection failed', 'WorkerService'),
    );
  }
  async onModuleDestroy() {
    await this.worker?.close();
  }
}
