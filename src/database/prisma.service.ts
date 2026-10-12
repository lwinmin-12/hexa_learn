import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly schemaName: string;
  constructor(@Inject(ConfigService) config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    const schema =
      new URL(connectionString).searchParams.get('schema') ?? 'public';
    super({
      adapter: new PrismaPg({ connectionString }, { schema }),
    });
    this.schemaName = schema;
  }

  // Serialize account mutations with deletion so an in-flight request cannot
  // restore personal data or register a device after the account is deleted.
  withActiveUser<T>(
    userId: string,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM ${Prisma.raw(`"${this.schemaName.replaceAll('"', '""')}"`)}.users
        WHERE id = ${userId}::uuid AND deleted_at IS NULL AND status = 'active'
        FOR UPDATE
      `);
      if (!rows.length)
        throw new UnauthorizedException('Account is unavailable');
      return action(tx);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
