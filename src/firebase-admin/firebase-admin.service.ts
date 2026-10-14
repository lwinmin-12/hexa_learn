import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';

export class InvalidFirebaseTokenException extends UnauthorizedException {
  constructor(code = 'INVALID_TOKEN') {
    super({
      statusCode: 401,
      message: 'Invalid or expired authentication token',
      code,
    });
  }
}

@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private auth!: Auth;

  onModuleInit() {
    const appName = 'hexa-auth';
    let app = getApps().find((candidate) => candidate.name === appName);
    if (!app) {
      const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
      let projectId = process.env.FIREBASE_PROJECT_ID;
      let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;

      if (encoded) {
        try {
          const credentials = JSON.parse(
            Buffer.from(encoded, 'base64').toString('utf8'),
          ) as Record<string, unknown>;
          projectId =
            typeof credentials.project_id === 'string'
              ? credentials.project_id
              : undefined;
          clientEmail =
            typeof credentials.client_email === 'string'
              ? credentials.client_email
              : undefined;
          privateKey =
            typeof credentials.private_key === 'string'
              ? credentials.private_key
              : undefined;
          if (!projectId || !clientEmail || !privateKey) {
            throw new Error('Incomplete service account');
          }
        } catch {
          throw new Error(
            'FIREBASE_SERVICE_ACCOUNT_BASE64 must contain base64-encoded service account JSON',
          );
        }
      }

      if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
      if ((clientEmail || privateKey) && (!clientEmail || !privateKey)) {
        throw new Error(
          'FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set together',
        );
      }
      app = initializeApp(
        {
          projectId,
          credential:
            clientEmail && privateKey
              ? cert({
                  projectId,
                  clientEmail,
                  privateKey: privateKey.replace(/\\n/g, '\n'),
                })
              : applicationDefault(),
        },
        appName,
      );
    }
    this.auth = getAuth(app);
  }

  async verifyIdToken(token: string): Promise<DecodedIdToken> {
    try {
      return await this.auth.verifyIdToken(token, true);
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (
        [
          'auth/argument-error',
          'auth/invalid-id-token',
          'auth/id-token-expired',
          'auth/id-token-revoked',
          'auth/user-disabled',
          'auth/user-not-found',
        ].includes(code ?? '')
      ) {
        throw new InvalidFirebaseTokenException(
          code === 'auth/id-token-expired'
            ? 'TOKEN_EXPIRED'
            : code === 'auth/id-token-revoked'
              ? 'TOKEN_REVOKED'
              : 'INVALID_TOKEN',
        );
      }
      throw new ServiceUnavailableException(
        'Firebase authentication is unavailable',
      );
    }
  }

  async revokeRefreshTokens(uid: string): Promise<void> {
    await this.auth.revokeRefreshTokens(uid);
  }
  async deleteUser(uid: string) {
    try {
      await this.auth.deleteUser(uid);
    } catch (error) {
      if ((error as { code?: string })?.code !== 'auth/user-not-found') {
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
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
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
