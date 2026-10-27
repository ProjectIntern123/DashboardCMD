import { PrismaService } from './prisma.service';

describe('PrismaService Isolation Guard', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  it('instantiates cleanly in non-staging environment', () => {
    delete process.env.APP_ENV;
    delete process.env.DEPLOY_ENV;
    delete process.env.STAGING;

    expect(() => new PrismaService()).not.toThrow();
  });

  it('fails construction in staging if DATABASE_URL is missing', () => {
    process.env.APP_ENV = 'staging';
    delete process.env.DATABASE_URL;

    expect(() => new PrismaService()).toThrow(
      /Staging environment requires an explicit, dedicated DATABASE_URL/,
    );
  });

  it('fails construction in staging if DATABASE_URL targets production database "cmd_office"', () => {
    process.env.APP_ENV = 'staging';
    process.env.DATABASE_URL = 'postgresql://db_user:secret@127.0.0.1:5432/cmd_office?schema=public';

    expect(() => new PrismaService()).toThrow(
      /Staging process cannot connect to production or default database "cmd_office"/,
    );
  });

  it('fails construction in staging if DATABASE_URL targets production database with staging suffix "cmd_office_staging"', () => {
    process.env.APP_ENV = 'staging';
    process.env.DATABASE_URL = 'postgresql://db_user:secret@127.0.0.1:5432/cmd_office_staging?schema=public';

    expect(() => new PrismaService()).toThrow(
      /Staging process cannot connect to production or default database "cmd_office_staging"/,
    );
  });

  it('fails construction in staging if DATABASE_URL uses superuser or non-staging user', () => {
    process.env.APP_ENV = 'staging';
    process.env.DATABASE_URL =
      'postgresql://postgres:secret@127.0.0.1:5432/cmd_staging?schema=public';

    expect(() => new PrismaService()).toThrow(
      /Staging database connection cannot use superuser account "postgres"/,
    );
  });

  it('fails construction if contradictory staging and production signals are set', () => {
    process.env.APP_ENV = 'staging';
    process.env.DEPLOY_ENV = 'production';
    process.env.DATABASE_URL =
      'postgresql://cmd_staging:secret@127.0.0.1:5432/cmd_staging?schema=public';

    expect(() => new PrismaService()).toThrow(
      /Contradictory environment variables detected/,
    );
  });

  it('instantiates in staging when dedicated staging database is provided (cmd_staging)', () => {
    process.env.APP_ENV = 'staging';
    process.env.DATABASE_URL =
      'postgresql://cmd_staging:secret@127.0.0.1:5432/cmd_staging?schema=public';

    expect(() => new PrismaService()).not.toThrow();
  });
});
