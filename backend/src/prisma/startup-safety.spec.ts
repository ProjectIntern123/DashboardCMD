import * as fs from 'fs';
import * as path from 'path';
import { RoleService } from '../role/role.service';
import { EmailTemplatesService, SYSTEM_NOTIFICATION_EVENTS } from '../email-templates/email-templates.service';

describe('Application Startup Safety & Read-Only Lifecycle (Offline)', () => {
  const rootDir = path.resolve(__dirname, '../../../');
  const backendSrcDir = path.resolve(__dirname, '../');

  describe('Task 1 — Legacy Super Admin Role Migration Elimination in main.ts', () => {
    it('verifies main.ts contains zero automatic role migrations or DML on startup', () => {
      const mainTs = fs.readFileSync(path.join(backendSrcDir, 'main.ts'), 'utf8');

      expect(mainTs).not.toContain('migrateSuperAdminToAdmin');
      expect(mainTs).not.toContain('prisma.role.delete');
      expect(mainTs).not.toContain('prisma.role.create');
      expect(mainTs).not.toContain('prisma.user.updateMany');
      expect(mainTs).not.toContain('prisma.approvalMatrix.updateMany');
      expect(mainTs).not.toContain('prisma.rolePermission');
    });

    it('verifies standalone migration utility exists, requires --confirm, supports --dry-run, and uses atomic transactions', () => {
      const scriptPath = path.join(rootDir, 'scripts/migrate-super-admin-to-admin.js');
      expect(fs.existsSync(scriptPath)).toBe(true);

      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      expect(scriptContent).toContain('--confirm');
      expect(scriptContent).toContain('--dry-run');
      expect(scriptContent).toContain('BLOCKED');
      expect(scriptContent).toContain('redactDatabaseUrl');
      expect(scriptContent).toContain('MANDATORY BACKUP WARNING');
      expect(scriptContent).toContain('pg_dump');
      expect(scriptContent).toContain('prisma.$transaction(async (tx)');
      expect(scriptContent).toContain('tx.user.updateMany');
      expect(scriptContent).toContain('tx.approvalMatrix.updateMany');
      expect(scriptContent).toContain('tx.rolePermission.upsert');
      expect(scriptContent).toContain('tx.role.delete');
    });

    it('verifies standalone migration utility is never invoked automatically in deployment or builds', () => {
      const deployProd = fs.readFileSync(path.join(rootDir, 'scripts/deploy-production.sh'), 'utf8');
      const deployWrapper = fs.readFileSync(path.join(rootDir, 'scripts/deploy.sh'), 'utf8');
      const buildJs = fs.readFileSync(path.join(rootDir, 'scripts/build.js'), 'utf8');

      expect(deployProd).not.toContain('migrate-super-admin');
      expect(deployWrapper).not.toContain('migrate-super-admin');
      expect(buildJs).not.toContain('migrate-super-admin');
    });
  });

  describe('Task 2 — RoleService Startup Elimination & CRUD Preservation', () => {
    let mockPrisma: any;
    let roleService: RoleService;

    beforeEach(() => {
      mockPrisma = {
        role: {
          findUnique: jest.fn(),
          findMany: jest.fn().mockResolvedValue([
            { id: 'role-admin', name: 'Admin', permissions: [] },
            { id: 'role-cmd', name: 'CMD', permissions: [] },
          ]),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        permission: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'perm-1', resource: 'Dashboard', action: 'View' },
          ]),
        },
        rolePermission: {
          createMany: jest.fn(),
          deleteMany: jest.fn(),
        },
      };

      roleService = new RoleService(mockPrisma);
    });

    it('verifies RoleService does not implement onModuleInit or create roles on boot', () => {
      // RoleService must not have an active onModuleInit hook that performs database mutations
      if ((roleService as any).onModuleInit) {
        (roleService as any).onModuleInit();
        expect(mockPrisma.role.create).not.toHaveBeenCalled();
        expect(mockPrisma.rolePermission.createMany).not.toHaveBeenCalled();
      }
      expect(mockPrisma.role.create).not.toHaveBeenCalled();
      expect(mockPrisma.rolePermission.createMany).not.toHaveBeenCalled();
    });

    it('preserves normal role query and management functionality for authorized admins', async () => {
      const roles = await roleService.findAll();
      expect(roles).toHaveLength(2);
      expect(mockPrisma.role.findMany).toHaveBeenCalled();

      const perms = await roleService.getPermissionsList();
      expect(perms).toHaveLength(1);
      expect(mockPrisma.permission.findMany).toHaveBeenCalled();
    });

    it('allows explicit role creation via service create() method without startup side-effects', async () => {
      mockPrisma.role.create.mockResolvedValue({ id: 'role-new', name: 'CustomRole' });
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'role-new', name: 'CustomRole', permissions: [] });

      const created = await roleService.create({ name: 'CustomRole', permissionIds: ['perm-1'] });
      expect(mockPrisma.role.create).toHaveBeenCalledWith({ data: { name: 'CustomRole' } });
      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [{ roleId: 'role-new', permissionId: 'perm-1' }],
      });
      expect(created.name).toBe('CustomRole');
    });
  });

  describe('Task 3 — EmailTemplatesService Read-Only Startup & In-Memory Fallback', () => {
    let mockPrisma: any;
    let emailService: EmailTemplatesService;

    beforeEach(() => {
      mockPrisma = {
        emailTemplate: {
          findUnique: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
      };

      emailService = new EmailTemplatesService(mockPrisma);
    });

    it('verifies onModuleInit performs zero database writes during application startup', async () => {
      await emailService.onModuleInit();

      expect(mockPrisma.emailTemplate.create).not.toHaveBeenCalled();
      expect(mockPrisma.emailTemplate.update).not.toHaveBeenCalled();
      expect(mockPrisma.emailTemplate.delete).not.toHaveBeenCalled();
    });

    it('seamlessly falls back to in-memory SYSTEM_NOTIFICATION_EVENTS when template is missing from DB', async () => {
      // Simulate DB returning null (template not in database)
      mockPrisma.emailTemplate.findUnique.mockResolvedValue(null);

      const result = await emailService.renderForEvent('mfa_otp', {
        user_name: 'Pankaj',
        otp_code: '987654',
        otp_expires_in: '10',
        support_email: 'support@example.com',
        company_name: 'HARTEK Group',
      });

      expect(result.isDisabled).toBe(false);
      expect(result.usingCustomTemplate).toBe(false);
      expect(result.subject).toContain('Multi-Factor Authentication OTP Code');
      expect(result.body).toContain('987654');
      expect(result.body).toContain('Pankaj');
      expect(result.body).toContain('HARTEK Group');
    });

    it('utilizes customized DB template when one exists in the database', async () => {
      // Simulate DB returning a custom user-edited template
      mockPrisma.emailTemplate.findUnique.mockResolvedValue({
        id: 'tmpl-custom',
        eventKey: 'MFA_OTP',
        name: 'Custom OTP',
        subject: 'Custom Security Notice: {{otp_code}}',
        body: 'Hello {{user_name}}, your code is {{otp_code}}.',
        isActive: true,
      });

      const result = await emailService.renderForEvent('mfa_otp', {
        user_name: 'CustomUser',
        otp_code: '123456',
      });

      expect(result.isDisabled).toBe(false);
      expect(result.usingCustomTemplate).toBe(true);
      expect(result.subject).toBe('Custom Security Notice: 123456');
      expect(result.body).toBe('Hello CustomUser, your code is 123456.');
    });

    it('respects isActive=false flag and disables delivery without errors', async () => {
      mockPrisma.emailTemplate.findUnique.mockResolvedValue({
        id: 'tmpl-disabled',
        eventKey: 'SECURITY_ALERT',
        isActive: false,
      });

      const result = await emailService.renderForEvent('security_alert', { user_name: 'User' });
      expect(result.isDisabled).toBe(true);
      expect(result.subject).toBe('');
      expect(result.body).toBe('');
    });

    it('allows explicit synchronization of default templates when triggered by authorized administrator', async () => {
      // First template missing, second exists
      mockPrisma.emailTemplate.findUnique.mockImplementation(async ({ where }: any) => {
        if (where.eventKey === SYSTEM_NOTIFICATION_EVENTS[0].eventKey) {
          return null;
        }
        return { id: 'existing-tmpl' };
      });

      mockPrisma.emailTemplate.create.mockResolvedValue({ id: 'new-tmpl' });

      const syncResult = await emailService.syncDefaultTemplates();
      expect(syncResult.success).toBe(true);
      expect(syncResult.createdCount).toBe(1);
      expect(syncResult.createdKeys).toEqual([SYSTEM_NOTIFICATION_EVENTS[0].eventKey]);
      expect(mockPrisma.emailTemplate.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Task 4 — Production Deployment Health-Check & Probe Safeguards (deploy-production.sh)', () => {
    const deployProdPath = path.join(rootDir, 'scripts/deploy-production.sh');

    it('verifies deploy-production.sh contains fail-closed health verification and node fallback', () => {
      const deployProd = fs.readFileSync(deployProdPath, 'utf8');

      expect(deployProd).toContain('check_http_endpoint()');
      expect(deployProd).toContain('command -v curl');
      expect(deployProd).toContain('node -e');
      expect(deployProd).toContain('Neither \'curl\' nor \'node\' executable is available');
      expect(deployProd).toContain('Failing closed to prevent unverified production deployment.');
      expect(deployProd).toContain('return 2');
    });

    it('verifies deploy-production.sh does not assume success when probe tools are missing', () => {
      const deployProd = fs.readFileSync(deployProdPath, 'utf8');

      // The script must not have blind fallback like "|| true" on curl
      expect(deployProd).not.toContain('curl -s -f "$url" || true');
      expect(deployProd).not.toContain('curl "$url" || exit 0');
    });

    describe('Offline Node.js HTTP fallback probe behavior', () => {
      let server: any;
      let serverUrl: string;
      let statusCodeToReturn = 200;

      beforeAll((done) => {
        const http = require('http');
        server = http.createServer((req: any, res: any) => {
          res.writeHead(statusCodeToReturn, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: statusCodeToReturn === 200 ? 'ok' : 'error' }));
        });
        server.listen(0, '127.0.0.1', () => {
          const port = server.address().port;
          serverUrl = `http://127.0.0.1:${port}/health`;
          done();
        });
      });

      afterAll((done) => {
        if (server) {
          server.close(done);
        } else {
          done();
        }
      });

      const runNodeProbe = (targetUrl: string): Promise<number> => {
        const { spawn } = require('child_process');
        const probeScript = `
          const http = require("http");
          const url = process.argv[1];
          const req = http.get(url, { timeout: 3000 }, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 400) {
              process.exit(0);
            } else {
              process.exit(1);
            }
          });
          req.on("error", () => process.exit(1));
          req.on("timeout", () => { req.destroy(); process.exit(1); });
        `;

        return new Promise((resolve) => {
          const child = spawn(process.execPath, ['-e', probeScript, targetUrl], {
            stdio: 'ignore',
          });
          child.on('close', (code: number | null) => {
            resolve(code ?? 1);
          });
          child.on('error', () => {
            resolve(1);
          });
        });
      };

      it('returns 0 (healthy) when endpoint responds with 200 OK', async () => {
        statusCodeToReturn = 200;
        const exitCode = await runNodeProbe(serverUrl);
        expect(exitCode).toBe(0);
      });

      it('returns 1 (failure) when endpoint responds with 500 Internal Server Error', async () => {
        statusCodeToReturn = 500;
        const exitCode = await runNodeProbe(serverUrl);
        expect(exitCode).toBe(1);
      });

      it('returns 1 (failure) when endpoint responds with 404 Not Found', async () => {
        statusCodeToReturn = 404;
        const exitCode = await runNodeProbe(serverUrl);
        expect(exitCode).toBe(1);
      });

      it('returns 1 (failure) when endpoint is unreachable (connection refused)', async () => {
        const exitCode = await runNodeProbe('http://127.0.0.1:59999/unreachable');
        expect(exitCode).toBe(1);
      });
    });
  });
});
