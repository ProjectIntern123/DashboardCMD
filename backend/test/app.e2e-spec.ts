import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertSafeTestDatabaseUrl, APPROVED_TEST_DATABASE_NAME } from './setup-test-db';

describe('AppController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // 1. Mandatory Pre-Flight URL Assertion: verifies loopback host and approved database name
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // 2. Mandatory Active DB Connection Check: queries PostgreSQL before initializing HTTP listeners
    prisma = moduleFixture.get(PrismaService);
    const dbCheck = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
    const connectedDb = dbCheck[0]?.current_database;

    if (connectedDb !== APPROVED_TEST_DATABASE_NAME) {
      throw new Error(
        `[CRITICAL TEST DB ISOLATION FAILURE] Active database is "${connectedDb}", expected strictly "${APPROVED_TEST_DATABASE_NAME}". Aborting before app initialization.`
      );
    }

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/ (GET) returns Hello World!', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
