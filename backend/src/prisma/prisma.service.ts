import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  getStagingPrismaClientOptions,
  isStagingEnvironment,
  assertSafeStagingDatabaseUrl,
} from './prisma-database.validator';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super(getStagingPrismaClientOptions());
  }

  async onModuleInit() {
    if (isStagingEnvironment()) {
      assertSafeStagingDatabaseUrl(process.env.DATABASE_URL);
      this.logger.log('Staging database configuration verified and isolated.');
    }
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
