import {ArgumentsHost, Catch, ExceptionFilter, HttpException, Injectable, Inject, CanActivate, ExecutionContext, SetMetadata, UseGuards, applyDecorators, createParamDecorator} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {ApiBearerAuth, ApiPropertyOptional, ApiTags} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {IsInt, Min, Max} from 'class-validator';
import type { Response } from 'express';
import type { User } from '@prisma/client';
import {FirebaseAuthGuard, AuthRequest} from '../auth/guard/auth.guard.js';

export function fail(status: number, code: string, message: string): never {
  throw new HttpException({ statusCode: status, code, message }, status);
}
export class PageDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
export const paging = (q: PageDto) => ({
  skip: (q.page - 1) * q.limit,
  take: q.limit,
});
export const listed = <T>(data: T[], total: number, q: PageDto) => ({
  data,
  meta: { page: q.page, limit: q.limit, total },
});
export const published = () => ({
  status: 'published' as const,
  OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }],
});
export const Roles = (...roles: User['role'][]) =>
  SetMetadata('platform:roles', roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User =>
    ctx.switchToHttp().getRequest<AuthRequest>().auth.user,
);
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const user = ctx.switchToHttp().getRequest<AuthRequest>().auth.user;
    if (!user.phoneVerifiedAt)
      fail(
        403,
        'PHONE_NOT_VERIFIED',
        'Verify your phone before accessing learning resources',
      );
    const roles = this.reflector.getAllAndOverride<User['role'][]>(
      'platform:roles',
      [ctx.getHandler(), ctx.getClass()],
    );
    if (roles?.length && !roles.includes(user.role))
      fail(403, 'FORBIDDEN', 'Role is not permitted');
    return true;
  }
}
export const Protected = (tag: string, ...roles: User['role'][]) =>
  applyDecorators(
    ApiTags(tag),
    ApiBearerAuth(),
    Roles(...roles),
    UseGuards(FirebaseAuthGuard, RolesGuard),
  );
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    let status = 500,
      code = 'INTERNAL_ERROR',
      message: string | string[] = 'An unexpected error occurred';
    if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse();
      const value =
        typeof body === 'string'
          ? { message: body }
          : (body as { code?: string; message?: string | string[] });
      code =
        value.code ??
        (
          {
            400: 'VALIDATION_ERROR',
            401: 'UNAUTHORIZED',
            403: 'FORBIDDEN',
            404: 'NOT_FOUND',
            409: 'CONFLICT',
          } as Record<number, string>
        )[status] ??
        'REQUEST_FAILED';
      message = value.message ?? error.message;
    } else if (typeof error === 'object' && error && 'code' in error) {
      const prismaCode = String(error.code);
      if (prismaCode === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        message = 'Resource not found';
      }
      if (['P2002', 'P2003', 'P2034'].includes(prismaCode)) {
        status = 409;
        code = 'CONFLICT';
        message = 'Resource conflicts with existing data; retry if concurrent';
      }
    }
    response.status(status).json({ statusCode: status, code, message });
  }
}
