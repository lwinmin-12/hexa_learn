import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Auth } from 'firebase-admin/auth';

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

@Injectable()
export class FirebaseService {
  private authInstance?: Auth;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  private get auth(): Auth {
    if (!this.authInstance) {
      const name = 'hexa-auth';
      const app =
        getApps().find((item) => item.name === name) ??
        initializeApp(
          {
            credential: applicationDefault(),
            projectId: this.config.getOrThrow<string>('FIREBASE_PROJECT_ID'),
          },
          name,
        );
      this.authInstance = getAuth(app);
    }
    return this.authInstance;
  }

  async verifyIdToken(token: string) {
    try {
      return await this.auth.verifyIdToken(token, true);
    } catch (error) {
      if (
        [
          'auth/argument-error',
          'auth/invalid-id-token',
          'auth/id-token-expired',
          'auth/id-token-revoked',
          'auth/user-disabled',
          'auth/user-not-found',
        ].includes(errorCode(error) ?? '')
      ) {
        throw new UnauthorizedException(
          'Invalid, expired, or revoked Firebase ID token',
        );
      }
      throw new ServiceUnavailableException(
        'Firebase authentication is unavailable',
      );
    }
  }

  async deleteUser(uid: string) {
    try {
      await this.auth.deleteUser(uid);
    } catch (error) {
      if (errorCode(error) !== 'auth/user-not-found') {
        throw new ServiceUnavailableException(
          'Firebase account deletion is unavailable',
        );
      }
    }
  }

  async sendVerificationCode(
    phoneNumber: string,
    recaptchaToken: string,
  ): Promise<string> {
    const result = await this.request('sendVerificationCode', {
      phoneNumber,
      recaptchaToken,
    });
    if (typeof result.sessionInfo !== 'string' || !result.sessionInfo) {
      throw new ServiceUnavailableException(
        'Firebase returned an invalid verification session',
      );
    }
    return result.sessionInfo;
  }

  async verifyPhone(
    sessionInfo: string,
    code: string,
    idToken: string,
    uid: string,
    phone: string,
  ) {
    // Including idToken links the verified phone to this account. Omitting it
    // could sign in as (or create) a different Firebase user.
    const result = await this.request('signInWithPhoneNumber', {
      sessionInfo,
      code,
      idToken,
    });
    if (result.temporaryProof)
      throw new ConflictException('Phone belongs to another Firebase account');
    if (result.localId !== uid || result.phoneNumber !== phone) {
      throw new BadRequestException(
        'Phone verification did not match this account',
      );
    }
  }

  private async request(
    method: string,
    body: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const apiKey = this.config.get<string>('FIREBASE_WEB_API_KEY');
    if (!apiKey)
      throw new ServiceUnavailableException(
        'Firebase phone authentication is not configured',
      );
    let response: Response;
    let data: Record<string, unknown>;
    try {
      response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10000),
        },
      );
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      throw new ServiceUnavailableException(
        'Firebase phone authentication is unavailable',
      );
    }
    if (!response.ok) {
      const code = (
        data.error as { message?: string } | undefined
      )?.message?.split(' : ')[0];
      if (
        response.status === 429 ||
        code === 'TOO_MANY_ATTEMPTS_TRY_LATER' ||
        code === 'QUOTA_EXCEEDED'
      ) {
        throw new HttpException(
          'Too many phone verification requests; try again later',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (
        ['PHONE_NUMBER_EXISTS', 'CREDENTIAL_ALREADY_IN_USE'].includes(
          code ?? '',
        )
      ) {
        throw new ConflictException('Phone belongs to another account');
      }
      if (
        [
          'INVALID_ID_TOKEN',
          'TOKEN_EXPIRED',
          'USER_DISABLED',
          'USER_NOT_FOUND',
        ].includes(code ?? '')
      ) {
        throw new UnauthorizedException(
          'Please refresh your Firebase ID token',
        );
      }
      if (
        [
          'INVALID_PHONE_NUMBER',
          'INVALID_CODE',
          'INVALID_VERIFICATION_CODE',
          'SESSION_EXPIRED',
          'INVALID_SESSION_INFO',
          'MISSING_SESSION_INFO',
          'CAPTCHA_CHECK_FAILED',
          'INVALID_APP_CREDENTIAL',
          'MISSING_APP_CREDENTIAL',
        ].includes(code ?? '')
      ) {
        throw new BadRequestException(
          'Invalid or expired phone verification details',
        );
      }
      throw new ServiceUnavailableException(
        'Firebase phone authentication is unavailable or misconfigured',
      );
    }
    return data;
  }
}
