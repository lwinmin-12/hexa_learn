import { FirebaseAdminModule } from '../firebase-admin/firebase-admin.module.js';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { MeController } from './me.controller.js';
import { AuthService } from './auth.service.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FirebaseAuthGuard } from './guard/auth.guard.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminAuthService } from './admin-auth.service.js';

@Module({
  imports: [FirebaseAdminModule],
  controllers: [AuthController, MeController, AdminAuthController],
  providers: [
    PrismaService,
    AuthService,
    AdminAuthService,
    FirebaseAuthGuard,
    AccountDeletionService,
  ],
  exports: [FirebaseAuthGuard, AuthService, PrismaService],
})
export class AuthModule {}
