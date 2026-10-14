import {Module} from '@nestjs/common';
import {ScheduleModule} from '@nestjs/schedule';
import {SharedModule} from './shared.module.js';
import {WorkerService} from './worker.service.js';
import {PublishingService} from './publishing.service.js';
import {CoursesModule} from '../courses/courses.module.js';
import {ChaptersEpisodesModule} from '../chapters-episodes/chapters-episodes.module.js';
import {ProgressModule} from '../progress/progress.module.js';
import {LearningToolsModule} from '../learning-tools/learning-tools.module.js';
import {QuizzesModule} from '../quizzes/quizzes.module.js';
import {PaymentsModule} from '../payments/payments.module.js';
import {AdminPaymentsModule} from '../admin-payments/admin-payments.module.js';
import {ChannelsModule} from '../channels/channels.module.js';
import {NotificationsModule} from '../notifications/notifications.module.js';
import {AdminChannelsModule} from '../admin-channels/admin-channels.module.js';
import {CertificatesModule} from '../certificates/certificates.module.js';
import {AdminContentModule} from '../admin-content/admin-content.module.js';
import {AdminLearningToolsModule} from '../admin-learning-tools/admin-learning-tools.module.js';
import {AdminQuizzesModule} from '../admin-quizzes/admin-quizzes.module.js';
import {AdminDashboardModule} from '../admin-dashboard/admin-dashboard.module.js';
@Module({
  imports: [
    SharedModule,
    ScheduleModule.forRoot(),
    CoursesModule,
    ChaptersEpisodesModule,
    ProgressModule,
    LearningToolsModule,
    QuizzesModule,
    PaymentsModule,
    AdminPaymentsModule,
    ChannelsModule,
    NotificationsModule,
    AdminChannelsModule,
    CertificatesModule,
    AdminContentModule,
    AdminLearningToolsModule,
    AdminQuizzesModule,
    AdminDashboardModule,
  ],
  providers: [WorkerService, PublishingService],
})
export class LearningPlatformModule {}
