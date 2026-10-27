import * as fs from 'fs';
import * as path from 'path';
import {
  validateStagingSeedEnvironment,
  runStagingSeed,
  SYNTHETIC_ROLES,
  SYNTHETIC_USERS,
  SYNTHETIC_SYSTEM_SETTINGS,
} from '../../prisma/seed.staging';

describe('Staging-Only Synthetic Seed Safety Controls', () => {
  const originalEnv = { ...process.env };

  const validStagingEnv: NodeJS.ProcessEnv = {
    APP_ENV: 'staging',
    DEPLOY_ENV: 'staging',
    STAGING: 'true',
    DATABASE_URL: 'postgresql://cmd_staging_user:secret@127.0.0.1:5432/cmd_staging?schema=public',
    STAGING_ADMIN_PASSWORD: 'ValidStagingSecureAdminPassword2026!',
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  describe('validateStagingSeedEnvironment guards', () => {
    it('refuses execution outside of staging environment (production safety lock)', () => {
      const prodEnv: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/cmd_staging',
        STAGING_ADMIN_PASSWORD: 'ValidStagingSecureAdminPassword2026!',
      };

      expect(() => validateStagingSeedEnvironment(prodEnv)).toThrow(
        /seed\.staging\.ts can ONLY be executed in a verified staging environment/,
      );
    });

    it('refuses execution when DATABASE_URL is missing or blank', () => {
      const missingDbEnv: NodeJS.ProcessEnv = {
        APP_ENV: 'staging',
        STAGING_ADMIN_PASSWORD: 'ValidStagingSecureAdminPassword2026!',
      };

      expect(() => validateStagingSeedEnvironment(missingDbEnv)).toThrow(
        /Staging environment requires an explicit, dedicated DATABASE_URL/,
      );
    });

    it('refuses execution when DATABASE_URL targets production database "cmd_office"', () => {
      const prodDbEnv: NodeJS.ProcessEnv = {
        APP_ENV: 'staging',
        DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/cmd_office',
        STAGING_ADMIN_PASSWORD: 'ValidStagingSecureAdminPassword2026!',
      };

      expect(() => validateStagingSeedEnvironment(prodDbEnv)).toThrow(
        /Staging process cannot connect to production or default database "cmd_office"/,
      );
    });

    it('refuses execution when DATABASE_URL targets production database prefix "cmd_office_staging"', () => {
      const prodSuffixEnv: NodeJS.ProcessEnv = {
        APP_ENV: 'staging',
        DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/cmd_office_staging',
        STAGING_ADMIN_PASSWORD: 'ValidStagingSecureAdminPassword2026!',
      };

      expect(() => validateStagingSeedEnvironment(prodSuffixEnv)).toThrow(
        /Staging process cannot connect to production or default database "cmd_office_staging"/,
      );
    });

    it('refuses execution when STAGING_ADMIN_PASSWORD is missing or blank', () => {
      const missingPassEnv: NodeJS.ProcessEnv = {
        APP_ENV: 'staging',
        DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/cmd_staging',
      };

      expect(() => validateStagingSeedEnvironment(missingPassEnv)).toThrow(
        /STAGING_ADMIN_PASSWORD environment variable is required and must be at least 12 characters/,
      );
    });

    it('refuses execution when STAGING_ADMIN_PASSWORD is too short (< 12 characters)', () => {
      const weakPassEnv: NodeJS.ProcessEnv = {
        APP_ENV: 'staging',
        DATABASE_URL: 'postgresql://user:pass@127.0.0.1:5432/cmd_staging',
        STAGING_ADMIN_PASSWORD: 'ShortPass1',
      };

      expect(() => validateStagingSeedEnvironment(weakPassEnv)).toThrow(
        /STAGING_ADMIN_PASSWORD environment variable is required and must be at least 12 characters/,
      );
    });

    it('accepts valid staging environment and valid administrator password', () => {
      const { validatedUrl, adminPassword } = validateStagingSeedEnvironment(validStagingEnv);
      expect(validatedUrl.pathname).toBe('/cmd_staging');
      expect(adminPassword).toBe('ValidStagingSecureAdminPassword2026!');
    });
  });

  describe('Synthetic User Data and Isolation Audit', () => {
    it('guarantees all synthetic user emails use reserved non-production domains (@example.com or @staging.local)', () => {
      for (const u of SYNTHETIC_USERS) {
        expect(u.email).not.toContain('@hartek.com');
        const domain = u.email.split('@')[1];
        expect(
          domain.endsWith('example.com') || domain.endsWith('staging.local'),
        ).toBe(true);
      }
    });

    it('confirms the synthetic dataset includes Admin, Manager, Supervisor, Employee, and Viewer roles', () => {
      const rolesSeeded = SYNTHETIC_USERS.map((u) => u.roleName);
      expect(rolesSeeded).toContain('Admin');
      expect(rolesSeeded).toContain('Manager');
      expect(rolesSeeded).toContain('Supervisor');
      expect(rolesSeeded).toContain('Employee');
      expect(rolesSeeded).toContain('Viewer');
    });

    it('verifies that seed.staging.ts source code does not import or invoke production seed.ts', () => {
      const seedStagingSource = fs.readFileSync(
        path.join(__dirname, '../../prisma/seed.staging.ts'),
        'utf8',
      );
      expect(seedStagingSource).not.toContain("from './seed'");
      expect(seedStagingSource).not.toContain('from "./seed"');
      expect(seedStagingSource).not.toContain("require('./seed')");
      expect(seedStagingSource).not.toContain('require("./seed")');
    });

    it('verifies that seed.staging.ts contains no hardcoded default passwords for admin', () => {
      const seedStagingSource = fs.readFileSync(
        path.join(__dirname, '../../prisma/seed.staging.ts'),
        'utf8',
      );
      expect(seedStagingSource).not.toContain('hartek123');
      expect(seedStagingSource).not.toContain('ChangeMeAdmin@2026!');
      expect(seedStagingSource).not.toContain('Admin@123');
    });
  });

  describe('Offline Mock Execution & Idempotency', () => {
    function createMockPrisma() {
      const calls: {
        createMany: string[];
        upsert: string[];
        create: string[];
        delete: string[];
      } = {
        createMany: [],
        upsert: [],
        create: [],
        delete: [],
      };

      const mockDbPermissions = [
        { id: 'perm-1', action: 'View', resource: 'Dashboard' },
        { id: 'perm-2', action: 'Create', resource: 'Projects' },
        { id: 'perm-3', action: 'Edit', resource: 'Projects' },
        { id: 'perm-4', action: 'Delete', resource: 'Projects' },
      ];

      return {
        calls,
        systemSetting: {
          createMany: jest.fn(async (args) => {
            calls.createMany.push('systemSetting');
            return { count: args.data.length };
          }),
        },
        department: {
          findFirst: jest.fn(async ({ where }) => ({ id: `dept-${where.name}`, name: where.name })),
          create: jest.fn(async ({ data }) => {
            calls.create.push(`department:${data.name}`);
            return { id: `dept-${data.name}`, name: data.name };
          }),
        },
        role: {
          upsert: jest.fn(async ({ where }) => {
            calls.upsert.push(`role:${where.name}`);
            return { id: `role-${where.name}`, name: where.name };
          }),
        },
        permission: {
          createMany: jest.fn(async (args) => {
            calls.createMany.push('permission');
            return { count: args.data.length };
          }),
          findMany: jest.fn(async () => mockDbPermissions),
        },
        rolePermission: {
          createMany: jest.fn(async (args) => {
            calls.createMany.push('rolePermission');
            return { count: args.data.length };
          }),
        },
        user: {
          upsert: jest.fn(async ({ where }) => {
            calls.upsert.push(`user:${where.email}`);
            return { id: `user-${where.email}`, email: where.email };
          }),
        },
      };
    }

    it('executes seeding idempotently without calling delete, drop, or truncate', async () => {
      const mockPrisma = createMockPrisma();

      const result = await runStagingSeed(mockPrisma as any, validStagingEnv);

      expect(result.rolesCount).toBe(SYNTHETIC_ROLES.length);
      expect(result.usersCount).toBe(SYNTHETIC_USERS.length);
      expect(mockPrisma.calls.createMany).toContain('systemSetting');
      expect(mockPrisma.calls.createMany).toContain('permission');
      expect(mockPrisma.calls.createMany).toContain('rolePermission');
      expect(mockPrisma.calls.delete.length).toBe(0);

      // Verify users were upserted, not blind-created
      const userUpsertCalls = mockPrisma.calls.upsert.filter((c) => c.startsWith('user:'));
      expect(userUpsertCalls.length).toBe(SYNTHETIC_USERS.length);

      // Verify outbound emails were disabled during run
      expect(validStagingEnv.DISABLE_OUTBOUND_EMAILS).toBe('true');
    });

    it('re-running seed is completely idempotent and safe against existing objects', async () => {
      const mockPrisma = createMockPrisma();

      // First run
      await runStagingSeed(mockPrisma as any, validStagingEnv);
      const initialUpsertCount = mockPrisma.calls.upsert.length;

      // Second run (simulating idempotent re-seeding)
      await runStagingSeed(mockPrisma as any, validStagingEnv);
      expect(mockPrisma.calls.upsert.length).toBe(initialUpsertCount * 2);
      expect(mockPrisma.calls.delete.length).toBe(0);
    });
  });
});
