import * as fs from 'fs';
import * as path from 'path';
import {
  isStagingEnvironment,
  isForbiddenProductionDbName,
  redactDatabaseUrl,
  getTrustedProductionDbIdentity,
  assertSafeStagingDatabaseUrl,
  getStagingPrismaClientOptions,
} from './prisma-database.validator';

const { loadStagingEnv } = require('../../../ecosystem.staging.config.js');

describe('Staging Database Isolation Validator', () => {
  const originalEnv = { ...process.env };
  const stagingEnv = { APP_ENV: 'staging' } as NodeJS.ProcessEnv;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  describe('isStagingEnvironment', () => {
    it('detects APP_ENV=staging', () => {
      expect(isStagingEnvironment({ APP_ENV: 'staging' } as any)).toBe(true);
    });

    it('detects DEPLOY_ENV=staging', () => {
      expect(isStagingEnvironment({ DEPLOY_ENV: 'staging' } as any)).toBe(true);
    });

    it('detects STAGING=true', () => {
      expect(isStagingEnvironment({ STAGING: 'true' } as any)).toBe(true);
    });

    it('returns false for production environment', () => {
      expect(isStagingEnvironment({ NODE_ENV: 'production' } as any)).toBe(false);
    });
  });

  describe('isForbiddenProductionDbName', () => {
    it('rejects exact production and system database names', () => {
      expect(isForbiddenProductionDbName('cmd_office')).toBe(true);
      expect(isForbiddenProductionDbName('cmd_office_prod')).toBe(true);
      expect(isForbiddenProductionDbName('database_name')).toBe(true);
      expect(isForbiddenProductionDbName('postgres')).toBe(true);
      expect(isForbiddenProductionDbName('template1')).toBe(true);
      expect(isForbiddenProductionDbName('')).toBe(true);
    });

    it('rejects production names with staging-like suffixes', () => {
      expect(isForbiddenProductionDbName('cmd_office_staging')).toBe(true);
      expect(isForbiddenProductionDbName('cmd_office_stage')).toBe(true);
      expect(isForbiddenProductionDbName('cmd_office_test')).toBe(true);
      expect(isForbiddenProductionDbName('cmd_office_staging_copy')).toBe(true);
      expect(isForbiddenProductionDbName('cmd_office-staging')).toBe(true);
    });

    it('allows dedicated staging database names', () => {
      expect(isForbiddenProductionDbName('cmd_staging')).toBe(false);
      expect(isForbiddenProductionDbName('cmd_stage')).toBe(false);
      expect(isForbiddenProductionDbName('hartek_staging')).toBe(false);
    });
  });

  describe('redactDatabaseUrl', () => {
    it('redacts credentials and strips query parameters from display', () => {
      const sensitiveUrl =
        'postgresql://admin_user:SuperSecret123!@127.0.0.1:5432/cmd_staging?schema=public&ssl=true';
      const redacted = redactDatabaseUrl(sensitiveUrl);
      expect(redacted).toBe('postgresql://[REDACTED]@127.0.0.1:5432/cmd_staging');
      expect(redacted).not.toContain('SuperSecret123!');
      expect(redacted).not.toContain('admin_user');
      expect(redacted).not.toContain('ssl=true');
    });

    it('handles malformed or empty URLs safely without leaking text', () => {
      expect(redactDatabaseUrl('')).toBe('[EMPTY_OR_UNDEFINED]');
      expect(redactDatabaseUrl(undefined)).toBe('[EMPTY_OR_UNDEFINED]');
      expect(redactDatabaseUrl('not a url')).toBe('[MALFORMED_URL]');
    });
  });

  describe('assertSafeStagingDatabaseUrl in staging', () => {
    it('throws when DATABASE_URL is missing or blank in staging', () => {
      expect(() => assertSafeStagingDatabaseUrl(undefined, stagingEnv)).toThrow(
        /Staging environment requires an explicit, dedicated DATABASE_URL/,
      );
      expect(() => assertSafeStagingDatabaseUrl('', stagingEnv)).toThrow(
        /Staging environment requires an explicit, dedicated DATABASE_URL/,
      );
      expect(() => assertSafeStagingDatabaseUrl('   ', stagingEnv)).toThrow(
        /Staging environment requires an explicit, dedicated DATABASE_URL/,
      );
    });

    it('rejects connection targeting production database "cmd_office"', () => {
      const prodUrl = 'postgresql://db_user:secret@127.0.0.1:5432/cmd_office?schema=public';
      expect(() => assertSafeStagingDatabaseUrl(prodUrl, stagingEnv)).toThrow(
        /Staging process cannot connect to production or default database "cmd_office"/,
      );
    });

    it('rejects production database names with staging-like suffixes (e.g. cmd_office_staging)', () => {
      const suffixedUrl1 = 'postgresql://db_user:secret@127.0.0.1:5432/cmd_office_staging';
      const suffixedUrl2 = 'postgresql://db_user:secret@127.0.0.1:5432/cmd_office_stage';
      const suffixedUrl3 = 'postgresql://db_user:secret@127.0.0.1:5432/cmd_office_staging_copy';

      expect(() => assertSafeStagingDatabaseUrl(suffixedUrl1, stagingEnv)).toThrow(
        /Staging process cannot connect to production or default database "cmd_office_staging"/,
      );
      expect(() => assertSafeStagingDatabaseUrl(suffixedUrl2, stagingEnv)).toThrow(
        /Staging process cannot connect to production or default database "cmd_office_stage"/,
      );
      expect(() => assertSafeStagingDatabaseUrl(suffixedUrl3, stagingEnv)).toThrow(
        /Staging process cannot connect to production or default database "cmd_office_staging_copy"/,
      );
    });

    it('rejects connection targeting default databases (postgres, template1, database_name)', () => {
      expect(() =>
        assertSafeStagingDatabaseUrl('postgresql://user:pass@127.0.0.1:5432/postgres', stagingEnv),
      ).toThrow(/Staging process cannot connect to production or default database "postgres"/);

      expect(() =>
        assertSafeStagingDatabaseUrl('postgresql://user:pass@127.0.0.1:5432/database_name', stagingEnv),
      ).toThrow(/Staging process cannot connect to production or default database "database_name"/);
    });

    it('rejects database names without affirmative staging/stage/test keyword', () => {
      const ambiguousUrl = 'postgresql://db_user:secret@127.0.0.1:5432/my_arbitrary_db';
      expect(() => assertSafeStagingDatabaseUrl(ambiguousUrl, stagingEnv)).toThrow(
        /Unsafe staging database target "my_arbitrary_db"/,
      );
    });

    it('rejects invalid database hosts (bind-all 0.0.0.0 or missing host)', () => {
      expect(() =>
        assertSafeStagingDatabaseUrl('postgresql://user:pass@0.0.0.0:5432/cmd_staging', stagingEnv),
      ).toThrow(/Invalid database host "0.0.0.0"/);

      expect(() =>
        assertSafeStagingDatabaseUrl('postgresql:///cmd_staging', stagingEnv),
      ).toThrow(/Malformed database URL: Missing hostname/);
    });

    it('rejects out-of-range or invalid ports', () => {
      // Ports > 65535 fail URL parsing directly
      expect(() =>
        assertSafeStagingDatabaseUrl('postgresql://user:pass@127.0.0.1:70000/cmd_staging', stagingEnv),
      ).toThrow(/Failed to parse staging DATABASE_URL: Invalid URL format/);

      // Port 0 is rejected by explicit port range check
      expect(() =>
        assertSafeStagingDatabaseUrl('postgresql://user:pass@127.0.0.1:0/cmd_staging', stagingEnv),
      ).toThrow(/Invalid database port: "0"/);
    });

    it('rejects invalid URL or non-postgres protocol', () => {
      expect(() => assertSafeStagingDatabaseUrl('not-a-url', stagingEnv)).toThrow(
        /Failed to parse staging DATABASE_URL: Invalid URL format/,
      );
      expect(() =>
        assertSafeStagingDatabaseUrl('mysql://root@127.0.0.1:3306/cmd_staging', stagingEnv),
      ).toThrow(/Invalid protocol "mysql:"/);
    });

    it('correctly parses URLs with URL-encoded credentials (%40, %23)', () => {
      const encodedUrl =
        'postgresql://cmd%40user:p%40ss%23word@127.0.0.1:5432/cmd_staging?schema=public';
      const parsed = assertSafeStagingDatabaseUrl(encodedUrl, stagingEnv);
      expect(parsed.hostname).toBe('127.0.0.1');
      expect(parsed.pathname).toBe('/cmd_staging');
      expect(parsed.port).toBe('5432');
    });

    it('accepts dedicated staging database URL (cmd_staging)', () => {
      const validStagingUrl =
        'postgresql://staging_user:staging_pass@127.0.0.1:5432/cmd_staging?schema=public';
      const parsed = assertSafeStagingDatabaseUrl(validStagingUrl, stagingEnv);
      expect(parsed.pathname).toBe('/cmd_staging');
    });

    it('rejects staging database when it matches trusted production database identity', () => {
      const trustedProd = {
        hostname: '127.0.0.1',
        port: 5432,
        dbName: 'staging_impersonator',
      };
      const matchingUrl = 'postgresql://user:pass@127.0.0.1:5432/staging_impersonator';

      expect(() =>
        assertSafeStagingDatabaseUrl(matchingUrl, stagingEnv, { trustedProdIdentity: trustedProd }),
      ).toThrow(
        /Staging database target matches the production database identity on host "127.0.0.1"/,
      );
    });
  });

  describe('getStagingPrismaClientOptions', () => {
    it('returns datasource override in staging when valid URL is provided', () => {
      const env = {
        APP_ENV: 'staging',
        DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/cmd_staging?schema=public',
      } as NodeJS.ProcessEnv;

      const opts = getStagingPrismaClientOptions(env);
      expect(opts).toEqual({
        datasources: {
          db: {
            url: 'postgresql://user:pass@127.0.0.1:5432/cmd_staging?schema=public',
          },
        },
      });
    });

    it('returns undefined in non-staging environment to preserve production defaults', () => {
      const prodEnv = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/cmd_office?schema=public',
      } as NodeJS.ProcessEnv;

      const opts = getStagingPrismaClientOptions(prodEnv);
      expect(opts).toBeUndefined();
    });
  });

  describe('loadStagingEnv from ecosystem.staging.config.js', () => {
    const tempEnvPath = path.join(__dirname, 'test.staging.env');

    afterEach(() => {
      if (fs.existsSync(tempEnvPath)) {
        fs.unlinkSync(tempEnvPath);
      }
    });

    it('correctly parses comments, quoted values, duplicate keys, and URL-encoded credentials', () => {
      const testContent = [
        '# This is a full comment',
        'APP_ENV="staging"',
        '# Another comment',
        'DATABASE_URL=\'postgresql://user%40domain:p%40ss%23word@127.0.0.1:5432/cmd_staging?schema=public\'',
        'PORT=4001',
        'DUPLICATE_KEY="first_value"',
        'DUPLICATE_KEY="second_value"',
        'EMPTY_KEY=',
        '',
      ].join('\n');

      fs.writeFileSync(tempEnvPath, testContent, 'utf8');

      const loaded = loadStagingEnv(tempEnvPath);
      expect(loaded.APP_ENV).toBe('staging');
      expect(loaded.DATABASE_URL).toBe(
        'postgresql://user%40domain:p%40ss%23word@127.0.0.1:5432/cmd_staging?schema=public',
      );
      expect(loaded.PORT).toBe('4001');
      expect(loaded.DUPLICATE_KEY).toBe('first_value');
      expect(loaded.EMPTY_KEY).toBe('');
    });

    it('returns empty object when file does not exist', () => {
      const loaded = loadStagingEnv('/nonexistent/path/.env.staging');
      expect(loaded).toEqual({});
    });
  });
});
