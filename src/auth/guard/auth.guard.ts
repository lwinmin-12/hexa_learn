import {
  createParamDecorator,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { FirebaseAdminService } from '../../firebase-admin/firebase-admin.service.js';
import { AuthService } from '../auth.service.js';

export interface AuthContext {
  user: User;
  claims: DecodedIdToken;
  idToken: string;
}

export type AuthRequest = Request & { auth: AuthContext };

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor(
    @Inject(FirebaseAdminService)
    private readonly firebase: FirebaseAdminService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(
      request.headers.authorization ?? '',
    );
    if (!match || match[1].length > 16384)
      throw new UnauthorizedException('A Firebase Bearer token is required');
    const claims = await this.firebase.verifyIdToken(match[1]);
    const user = await this.authService.findActiveUser(claims.uid);
    request.auth = { user, claims, idToken: match[1] };
    return true;
  }
}

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext =>
    context.switchToHttp().getRequest<AuthRequest>().auth,
);
