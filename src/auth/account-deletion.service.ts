import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { FirebaseAdminService } from '../firebase-admin/firebase-admin.service.js';

@Injectable()
export class AccountDeletionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountDeletionService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;

  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FirebaseAdminService)
    private readonly firebase: FirebaseAdminService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.flush();
    }, 60000);
    this.timer.unref();
    void this.flush();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
  }

  flush(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.processPending()
      .catch(() => {
        this.logger.warn(
          'Account deletion cleanup failed; it will retry in 60 seconds',
        );
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  private async processPending() {
    const pending = await this.db.user.findMany({
      where: { deletedAt: { not: null }, firebaseDeletedAt: null },
      select: { id: true, firebaseUid: true },
    });
    for (const user of pending) {
      try {
        await this.firebase.deleteUser(user.firebaseUid);
        await this.db.user.update({
          where: { id: user.id },
          data: { firebaseDeletedAt: new Date() },
        });
      } catch {
        this.logger.warn(
          `Firebase deletion pending for local account ${user.id}`,
        );
      }
    }
  }
}
