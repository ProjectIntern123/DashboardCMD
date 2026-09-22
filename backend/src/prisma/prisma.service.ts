import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    try {
      await this.$executeRawUnsafe(
        'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "immuneFromEscalation" BOOLEAN DEFAULT false;'
      );
      this.logger.log('Database schema column check completed ("immuneFromEscalation").');
    } catch (e: any) {
      this.logger.warn(`Database column auto-sync notice: ${e.message || e}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
