import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { MeController } from './me.controller.js';
import { AuthService } from './auth.service.js';
import { FirebaseService } from './firebase.service.js';
import { FirebaseAuthGuard } from './auth.guard.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { PrismaService } from '../database/prisma.service.js';

@Module({
  controllers: [AuthController, MeController],
  providers: [
    PrismaService,
    FirebaseService,
    AuthService,
    FirebaseAuthGuard,
    AccountDeletionService,
  ],
  exports: [FirebaseAuthGuard, AuthService, PrismaService],
})
export class AuthModule {}
