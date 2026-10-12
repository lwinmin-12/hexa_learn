import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthProvider, User } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import { FirebaseService } from './firebase.service.js';
import type { AuthContext } from './auth.guard.js';
import type {
  RegisterDeviceDto,
  SendOtpDto,
  UpdateProfileDto,
  VerifyOtpDto,
} from './auth.dto.js';

const PROVIDERS: Record<string, AuthProvider> = {
  'google.com': 'google',
  'apple.com': 'apple',
  'facebook.com': 'facebook',
};
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export function profile(user: User) {
  const {
    id,
    email,
    displayName,
    avatarUrl,
    phone,
    phoneVerifiedAt,
    role,
    status,
    provider,
    createdAt,
  } = user;
  return {
    id,
    email,
    displayName,
    avatarUrl,
    phone,
    phoneVerifiedAt,
    role,
    status,
    provider,
    createdAt,
  };
}

function isUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FirebaseService) private readonly firebase: FirebaseService,
  ) {}

  async login(idToken: string) {
    const claims = await this.firebase.verifyIdToken(idToken);
    const existing = await this.db.user.findUnique({
      where: { firebaseUid: claims.uid },
    });
    if (existing) {
      this.assertActive(existing);
      return profile(existing);
    }
    const provider = PROVIDERS[claims.firebase.sign_in_provider];
    if (!provider)
      throw new BadRequestException(
        'New accounts must sign in with Google, Apple, or Facebook',
      );
    let user: User;
    try {
      user = await this.db.user.create({
        data: {
          firebaseUid: claims.uid,
          provider,
          email: claims.email ?? null,
          displayName: typeof claims.name === 'string' ? claims.name : null,
          avatarUrl: claims.picture ?? null,
        },
      });
    } catch (error) {
      if (!isUniqueError(error)) throw error;
      // A concurrent first login may have created the same UID.
      user = await this.db.user.findUniqueOrThrow({
        where: { firebaseUid: claims.uid },
      });
    }
    this.assertActive(user);
    return profile(user);
  }

  async findActiveUser(firebaseUid: string) {
    const user = await this.db.user.findUnique({ where: { firebaseUid } });
    if (!user) throw new UnauthorizedException('Call /auth/login first');
    this.assertActive(user);
    return user;
  }

  private assertActive(user: User) {
    if (user.deletedAt)
      throw new UnauthorizedException('Account has been deleted');
    if (user.status !== 'active')
      throw new ForbiddenException('Account is suspended');
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.db.withActiveUser(userId, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: { displayName: dto.displayName, avatarUrl: dto.avatarUrl },
      }),
    );
    return profile(user);
  }

  async sendOtp(userId: string, dto: SendOtpDto) {
    const now = new Date();
    const verificationId = randomUUID();
    await this.db.withActiveUser(userId, async (tx) => {
      const previous = await tx.phoneVerification.findUnique({
        where: { userId },
      });
      if (
        previous &&
        now.getTime() - previous.lastSentAt.getTime() < OTP_RESEND_MS
      ) {
        throw new HttpException(
          'Wait 60 seconds before requesting another code',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const data = {
        id: verificationId,
        phone: dto.phone,
        sessionInfo: null,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        attempts: 0,
      };
      await tx.phoneVerification.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
    });
    // Do not hold a database transaction open while Firebase sends the SMS.
    const sessionInfo = await this.firebase.sendVerificationCode(
      dto.phone,
      dto.recaptchaToken,
    );
    await this.db.withActiveUser(userId, async (tx) => {
      const result = await tx.phoneVerification.updateMany({
        where: { userId, id: verificationId },
        data: { sessionInfo },
      });
      if (!result.count)
        throw new BadRequestException(
          'Verification was replaced; request another code',
        );
    });
    return {
      verificationId,
      expiresIn: OTP_TTL_MS / 1000,
      resendAfter: OTP_RESEND_MS / 1000,
    };
  }

  async verifyOtp(auth: AuthContext, dto: VerifyOtpDto) {
    const challenge = await this.db.withActiveUser(auth.user.id, async (tx) => {
      const challenge = await tx.phoneVerification.findUnique({
        where: { userId: auth.user.id },
      });
      if (
        !challenge ||
        challenge.id !== dto.verificationId ||
        !challenge.sessionInfo ||
        challenge.expiresAt <= new Date()
      ) {
        throw new BadRequestException(
          'Invalid or expired verification session',
        );
      }
      if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
        throw new HttpException(
          'Too many attempts; request a new code',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await tx.phoneVerification.update({
        where: { userId: auth.user.id },
        data: { attempts: { increment: 1 } },
      });
      return challenge;
    });
    await this.firebase.verifyPhone(
      challenge.sessionInfo!,
      dto.code,
      auth.idToken,
      auth.user.firebaseUid,
      challenge.phone,
    );
    try {
      const user = await this.db.withActiveUser(auth.user.id, async (tx) => {
        const consumed = await tx.phoneVerification.deleteMany({
          where: {
            userId: auth.user.id,
            id: dto.verificationId,
            expiresAt: { gt: new Date() },
          },
        });
        if (!consumed.count)
          throw new BadRequestException(
            'Verification was already used or expired',
          );
        return tx.user.update({
          where: { id: auth.user.id },
          data: {
            phone: challenge.phone,
            phoneVerifiedAt: new Date(),
          },
        });
      });
      return profile(user);
    } catch (error) {
      if (isUniqueError(error))
        throw new ConflictException(
          'Phone is already registered to another account',
        );
      throw error;
    }
  }

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    // Reassign a token on login from a shared device so the previous account
    // no longer receives notifications on it.
    return this.db.withActiveUser(userId, (tx) =>
      tx.deviceToken.upsert({
        where: { fcmToken: dto.token },
        create: { userId, fcmToken: dto.token, platform: dto.platform },
        update: { userId, platform: dto.platform },
        select: { id: true, platform: true, updatedAt: true },
      }),
    );
  }

  async removeDevice(userId: string, token: string) {
    await this.db.deviceToken.deleteMany({
      where: { userId, fcmToken: token },
    });
  }

  async deleteAccount(auth: AuthContext) {
    // Require a recent sign-in, not merely a refreshed ID token.
    if (Date.now() / 1000 - auth.claims.auth_time > 300) {
      throw new UnauthorizedException(
        'Reauthenticate within 5 minutes before deleting your account',
      );
    }
    await this.db.withActiveUser(auth.user.id, async (tx) => {
      await tx.deviceToken.deleteMany({ where: { userId: auth.user.id } });
      await tx.phoneVerification.deleteMany({
        where: { userId: auth.user.id },
      });
      await tx.user.update({
        where: { id: auth.user.id },
        data: {
          deletedAt: new Date(),
          status: 'suspended',
          email: null,
          displayName: null,
          avatarUrl: null,
          phone: null,
          phoneVerifiedAt: null,
        },
      });
    });
    // The tombstone prevents login from recreating an account if Firebase is
    // temporarily unavailable. The cleanup worker retries deletion durably.
  }
}
