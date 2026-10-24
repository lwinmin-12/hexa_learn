import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { FirebaseAdminService } from '../firebase-admin/firebase-admin.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { profile } from './auth.service.js';

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(FirebaseAdminService)
    private readonly firebase: FirebaseAdminService,
    @Inject(PrismaService) private readonly db: PrismaService,
  ) {}

  async login(email: string, password: string) {
    const tokens = await this.exchange('login', {
      email,
      password,
      returnSecureToken: true,
    });
    return this.session(tokens);
  }

  async refresh(refreshToken: string) {
    const tokens = await this.exchange('refresh', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    return this.session(tokens);
  }

  private async session(tokens: {
    idToken: string;
    refreshToken: string;
    expiresIn: number;
  }) {
    const claims = await this.firebase.verifyIdToken(tokens.idToken);
    const user = await this.db.user.findUnique({
      where: { firebaseUid: claims.uid },
    });
    if (
      claims.firebase.sign_in_provider !== 'password' ||
      !user ||
      user.deletedAt ||
      user.status !== 'active' ||
      !['super_admin', 'page_admin'].includes(user.role)
    ) {
      throw new UnauthorizedException(
        'Invalid admin credentials or account unavailable',
      );
    }
    return { ...tokens, user: profile(user) };
  }

  private async exchange(
    kind: 'login' | 'refresh',
    body: Record<string, string | boolean>,
  ) {
    const key = process.env.FIREBASE_WEB_API_KEY;

    if (!key)
      throw new ServiceUnavailableException(
        'Admin password login is not configured',
      );

    const endpoint =
      kind === 'login'
        ? `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`
        : `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(key)}`;

    let response: Response;
    let data: unknown;

    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type':
            kind === 'login'
              ? 'application/json'
              : 'application/x-www-form-urlencoded',
        },
        body:
          kind === 'login'
            ? JSON.stringify(body)
            : new URLSearchParams(
                Object.entries(body).map(([name, value]) => [
                  name,
                  String(value),
                ]),
              ),
        signal: AbortSignal.timeout(10000),
      });
      data = await response.json();
    } catch {
      throw new ServiceUnavailableException(
        'Admin authentication is temporarily unavailable',
      );
    }
    
    if (!response.ok) {
      if (
        response.status === 429 ||
        (typeof data === 'object' &&
          data !== null &&
          'error' in data &&
          typeof data.error === 'object' &&
          data.error !== null &&
          'message' in data.error &&
          String(data.error.message).startsWith('TOO_MANY_ATTEMPTS'))
      ) {
        throw new HttpException(
          'Too many sign-in attempts. Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (response.status >= 500)
        throw new ServiceUnavailableException(
          'Admin authentication is temporarily unavailable',
        );
      throw new UnauthorizedException(
        'Invalid admin credentials or session expired',
      );
    }

    if (typeof data !== 'object' || data === null)
      throw new ServiceUnavailableException('Invalid authentication response');
    const idToken =
      'idToken' in data
        ? data.idToken
        : 'id_token' in data
          ? data.id_token
          : null;
    const refreshToken =
      'refreshToken' in data
        ? data.refreshToken
        : 'refresh_token' in data
          ? data.refresh_token
          : null;
    const expiresIn = Number(
      'expiresIn' in data
        ? data.expiresIn
        : 'expires_in' in data
          ? data.expires_in
          : null,
    );

    if (
      typeof idToken !== 'string' ||
      !idToken ||
      typeof refreshToken !== 'string' ||
      !refreshToken ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0
    ) {
      throw new ServiceUnavailableException('Invalid authentication response');
    }
    return { idToken, refreshToken, expiresIn };
  }
}
