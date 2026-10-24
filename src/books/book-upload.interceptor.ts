import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import multer, { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Request, Response } from 'express';
import { defer, lastValueFrom } from 'rxjs';
import { fail } from '../platform/common.js';

export const bookMaxBytes = () => {
  const mb = Number(process.env.BOOK_MAX_MB ?? 50);
  if (!Number.isFinite(mb) || mb <= 0)
    throw new Error('BOOK_MAX_MB must be a positive number');
  return Math.floor(mb * 1024 * 1024);
};

@Injectable()
export class BookUploadInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    return defer(async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          multer({
            storage: diskStorage({
              destination: tmpdir(),
              filename: (_req, _file, done) =>
                done(null, `hexa-book-${randomUUID()}`),
            }),
            limits: {
              fileSize: bookMaxBytes(),
              files: 1,
              fields: 5,
              fieldSize: 4096,
              parts: 6,
            },
          }).single('file')(request, response, (error: unknown) => {
            if (error) reject(error);
            else resolve();
          });
        });
        return await lastValueFrom(next.handle());
      } catch (error) {
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE')
            fail(413, 'BOOK_TOO_LARGE', 'Book exceeds BOOK_MAX_MB');
          fail(
            400,
            'BOOK_INVALID_FILE',
            'Send one PDF file and the supported book fields',
          );
        }
        throw error;
      } finally {
        if (request.file?.path)
          await unlink(request.file.path).catch(() => undefined);
      }
    });
  }
}
