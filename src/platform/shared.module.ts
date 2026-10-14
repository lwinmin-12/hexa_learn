import {Global, Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {OwnershipService} from './ownership.service.js';
import {StorageService} from './storage.service.js';
import {JobsService, FcmService} from './jobs.service.js';
import {RolesGuard} from './common.js';
@Global()
@Module({
  imports: [AuthModule],
  providers: [
    OwnershipService,
    StorageService,
    JobsService,
    FcmService,
    RolesGuard,
  ],
  exports: [
    AuthModule,
    OwnershipService,
    StorageService,
    JobsService,
    FcmService,
    RolesGuard,
  ],
})
export class SharedModule {}
