import * as fs from 'fs';
import * as path from 'path';
import { assertNotProductionSeed } from '../../prisma/seed';

describe('Production Seed Safety & Anti-Seeding Safeguards (Offline)', () => {
  const rootDir = path.resolve(__dirname, '../../../');
  const backendDir = path.resolve(__dirname, '../../');

  describe('assertNotProductionSeed Guard in seed.ts', () => {
    it('throws immediately when NODE_ENV is "production" before any DB query', () => {
      expect(() => {
        assertNotProductionSeed({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/cmd_dev',
        });
      }).toThrow(/Production seeding is strictly forbidden/);
    });

    it('throws immediately when APP_ENV is "production"', () => {
      expect(() => {
        assertNotProductionSeed({
          NODE_ENV: 'development',
          APP_ENV: 'production',
          DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/cmd_dev',
        });
      }).toThrow(/Production seeding is strictly forbidden/);
    });

    it('throws when DATABASE_URL targets production database "cmd_office"', () => {
      expect(() => {
        assertNotProductionSeed({
          NODE_ENV: 'development',
          APP_ENV: 'development',
          DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/cmd_office',
        });
      }).toThrow(/appears to be a production database/);
    });

    it('throws when DATABASE_URL targets production database "cmd_office_prod"', () => {
      expect(() => {
        assertNotProductionSeed({
          NODE_ENV: 'development',
          APP_ENV: 'development',
          DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/cmd_office_prod',
        });
      }).toThrow(/appears to be a production database/);
    });

    it('throws when DATABASE_URL is malformed or invalid', () => {
      expect(() => {
        assertNotProductionSeed({
          NODE_ENV: 'development',
          DATABASE_URL: 'http://not-a-valid-db-url-:::invalid',
        });
      }).toThrow(/Invalid or unparseable DATABASE_URL/);
    });

    it('allows execution in valid non-production development environment with safe dev DB', () => {
      expect(() => {
        assertNotProductionSeed({
          NODE_ENV: 'development',
          APP_ENV: 'development',
          DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/cmd_dev',
        });
      }).not.toThrow();
    });

    it('allows execution in test environment with safe test DB', () => {
      expect(() => {
        assertNotProductionSeed({
          NODE_ENV: 'test',
          APP_ENV: 'test',
          DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/cmd_test',
        });
      }).not.toThrow();
    });
  });

  describe('Production Deployment Script Safeguards', () => {
    it('verifies deploy-production.sh contains zero seed invocations', () => {
      const deployProdPath = path.join(rootDir, 'scripts/deploy-production.sh');
      const content = fs.readFileSync(deployProdPath, 'utf8');

      expect(content).not.toContain('prisma db seed');
      expect(content).not.toContain('seed.ts');
      expect(content).not.toContain('seed.staging.ts');
      expect(content).not.toContain('prisma db push');
      expect(content).not.toContain('prisma migrate dev');
    });

    it('verifies deploy.sh wrapper delegates cleanly without seeding', () => {
      const deployPath = path.join(rootDir, 'scripts/deploy.sh');
      const content = fs.readFileSync(deployPath, 'utf8');

      expect(content).not.toContain('seed');
      expect(content).toContain('deploy-production.sh');
    });

    it('verifies deploy-production.sh locks out automatic migrations if migration files exist', () => {
      const deployProdPath = path.join(rootDir, 'scripts/deploy-production.sh');
      const content = fs.readFileSync(deployProdPath, 'utf8');

      expect(content).toContain('backend/prisma/migrations/');
      expect(content).toContain('BLOCKED: Automatic production migrations are disabled');
    });
  });

  describe('Setup Script Safeguards (setup.sh and setup.bat)', () => {
    it('verifies setup.sh contains no automatic prisma db seed', () => {
      const setupShPath = path.join(rootDir, 'setup.sh');
      const content = fs.readFileSync(setupShPath, 'utf8');

      expect(content).not.toContain('prisma db seed');
      expect(content).toContain('PRODUCTION SAFETY LOCK');
      expect(content).toContain('NODE_ENV');
    });

    it('verifies setup.bat contains no automatic prisma db seed', () => {
      const setupBatPath = path.join(rootDir, 'setup.bat');
      const content = fs.readFileSync(setupBatPath, 'utf8');

      expect(content).not.toContain('prisma db seed');
      expect(content).toContain('PROD_LOCKED');
    });

    it('verifies setup-server.sh advises deploy-production.sh and warns against seeds in production', () => {
      const setupServerPath = path.join(rootDir, 'scripts/setup-server.sh');
      const content = fs.readFileSync(setupServerPath, 'utf8');

      expect(content).toContain('deploy-production.sh');
      expect(content).toContain('Production never executes seeds');
    });
  });

  describe('Package Build and Startup Indirect Invocation Checks', () => {
    it('verifies backend package.json scripts do not trigger seed hooks', () => {
      const backendPkg = JSON.parse(
        fs.readFileSync(path.join(backendDir, 'package.json'), 'utf8')
      );

      const scripts = backendPkg.scripts || {};
      expect(scripts['build']).toBe('nest build');
      expect(scripts['start:prod']).toBe('node dist/main');
      expect(scripts['prebuild']).toBeUndefined();
      expect(scripts['postbuild']).toBeUndefined();
      expect(scripts['prestart']).toBeUndefined();
      expect(scripts['poststart']).toBeUndefined();
    });

    it('verifies root package.json scripts do not trigger seed hooks', () => {
      const rootPkg = JSON.parse(
        fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
      );

      const scripts = rootPkg.scripts || {};
      expect(scripts['build']).toBe('node scripts/build.js');
      expect(scripts['start']).toBe('node scripts/start.js');
    });

    it('verifies scripts/build.js and scripts/start.js do not execute seeds', () => {
      const buildJs = fs.readFileSync(path.join(rootDir, 'scripts/build.js'), 'utf8');
      const startJs = fs.readFileSync(path.join(rootDir, 'scripts/start.js'), 'utf8');

      expect(buildJs).not.toContain('seed');
      expect(startJs).not.toContain('seed');
    });
  });

  describe('Staging Initialization Separation from Production', () => {
    it('verifies init-staging-db.sh exclusively runs seed.staging.ts and does not touch seed.ts', () => {
      const initStagingSh = fs.readFileSync(path.join(rootDir, 'scripts/init-staging-db.sh'), 'utf8');

      expect(initStagingSh).toContain('prisma/seed.staging.ts');
      expect(initStagingSh).not.toContain('prisma/seed.ts');
    });

    it('verifies seed.ts and seed.staging.ts remain separate without cross-invocation', () => {
      const seedTs = fs.readFileSync(path.join(backendDir, 'prisma/seed.ts'), 'utf8');
      const seedStagingTs = fs.readFileSync(path.join(backendDir, 'prisma/seed.staging.ts'), 'utf8');

      // seed.ts must not call or redirect to seed.staging.ts
      expect(seedTs).not.toContain('seed.staging');
      // seed.staging.ts must not import or invoke seed.ts
      expect(seedStagingTs).not.toContain("from './seed'");
      expect(seedStagingTs).not.toContain("require('./seed')");
      expect(seedStagingTs).not.toContain("from '../seed'");
    });
  });
});
