import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';

describe('Staging Deployment, Preflight & Rollback Safety Safeguards (F-01, F-02, F-03)', () => {
  jest.setTimeout(30000);

  const rootDir = path.resolve(__dirname, '../../../');
  const preflightScriptPath = path.join(rootDir, 'scripts/preflight-staging.sh');
  const deployScriptPath = path.join(rootDir, 'scripts/deploy-staging.sh');
  const rollbackScriptPath = path.join(rootDir, 'scripts/rollback-staging.sh');

  const findBash = (): string => {
    const candidates = [
      process.env.SHELL,
      path.join(process.env.LOCALAPPDATA || '', 'Programs/Git/bin/bash.exe'),
      'C:/Program Files/Git/bin/bash.exe',
      'C:/Program Files (x86)/Git/bin/bash.exe',
      'bash',
    ].filter(Boolean) as string[];

    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return 'bash';
  };

  const bashExecutable = findBash();

  const toPosixPath = (winPath: string): string => {
    return winPath.replace(/^[A-Za-z]:/, (m) => '/' + m[0].toLowerCase()).replace(/\\/g, '/');
  };

  const runBash = (
    cmd: string,
    cwd: string = rootDir,
    env: Record<string, string> = {}
  ): Promise<{ code: number; stdout: string; stderr: string }> => {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      const child = spawn(bashExecutable, ['-c', cmd], {
        cwd,
        env: { ...process.env, ...env },
        windowsHide: true,
      });

      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('close', (code) => {
        resolve({ code: code ?? 1, stdout, stderr });
      });
      child.on('error', () => {
        resolve({ code: 1, stdout, stderr });
      });
    });
  };

  let mockBinDir: string;
  let mockBinPosix: string;

  beforeAll(() => {
    mockBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-mock-bin-'));
    mockBinPosix = toPosixPath(mockBinDir);
    // Create mock pm2 binary so tool availability checks pass in unit test sandbox
    const pm2Bin = path.join(mockBinDir, 'pm2');
    fs.writeFileSync(pm2Bin, '#!/usr/bin/env bash\necho "5.4.0"\nexit 0\n');
    try {
      fs.chmodSync(pm2Bin, '755');
    } catch {
      // Windows compatibility
    }
  });

  afterAll(() => {
    if (mockBinDir && fs.existsSync(mockBinDir)) {
      fs.rmSync(mockBinDir, { recursive: true, force: true });
    }
  });

  // Helper to initialize basic workspace markers in a sandbox
  const initSandboxWorkspace = (dir: string) => {
    fs.mkdirSync(path.join(dir, 'backend'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'frontend'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'backend/package.json'), JSON.stringify({ name: 'backend', version: '0.0.1' }));
    fs.writeFileSync(path.join(dir, 'frontend/package.json'), JSON.stringify({ name: 'frontend', version: '0.0.1' }));
  };

  // =========================================================================
  // F-01: STAGING INSTALLATION IDENTITY & DIRECTORY PROTECTION
  // =========================================================================
  describe('F-01: Staging Installation Identity & Directory Protection', () => {
    describe('Static Analysis of Preflight & Deploy Staging Scripts', () => {
      it('verifies preflight-staging.sh resolves canonical directory and defines known prod directories', () => {
        const content = fs.readFileSync(preflightScriptPath, 'utf8');

        expect(content).toContain('CANONICAL_DIR="$(cd "$PROJECT_DIR" && pwd -P)"');
        expect(content).toContain('/var/www/cmd-dashboard');
        expect(content).toContain('/var/www/CMDDashboard');
        expect(content).toContain('/var/www/cmd_office');
        expect(content).toContain('/srv/cmd-dashboard');
        expect(content).toContain('PROD_PROJECT_DIR');
        expect(content).toContain('[CRITICAL ISOLATION BREACH]');
      });

      it('verifies deploy-staging.sh contains Step 0 canonical directory fail-closed check', () => {
        const content = fs.readFileSync(deployScriptPath, 'utf8');

        expect(content).toContain('STEP 0: CANONICAL DIRECTORY IDENTITY & FAIL-CLOSED PROTECTION');
        expect(content).toContain('CANONICAL_DIR="$(cd "$PROJECT_DIR" && pwd -P)"');
        expect(content).toContain('/var/www/cmd-dashboard');
        expect(content).toContain('Refusing deployment to protect production application.');
      });

      it('verifies preflight-staging.sh checks for staging-specific PM2 process names and rejects prod names', () => {
        const content = fs.readFileSync(preflightScriptPath, 'utf8');

        expect(content).toContain('cmd-staging-backend');
        expect(content).toContain('cmd-staging-frontend');
        expect(content).toContain('ecosystem.staging.config.js improperly defines production process names');
      });

      it('verifies preflight-staging.sh validates database target against explicit staging-only rules', () => {
        const content = fs.readFileSync(preflightScriptPath, 'utf8');

        expect(content).toContain("Production database names (including 'cmd_office' and variants) are strictly forbidden.");
        expect(content).toContain("Staging cannot connect using superuser account");
        expect(content).toContain("Staging database name must explicitly contain 'staging', 'stage', or 'test'");
      });
    });

    describe('Dynamic Isolation & Fail-Closed Behavior', () => {
      let sandboxDir: string;

      beforeEach(() => {
        sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-staging-test-'));
        initSandboxWorkspace(sandboxDir);
      });

      afterEach(() => {
        if (fs.existsSync(sandboxDir)) {
          fs.rmSync(sandboxDir, { recursive: true, force: true });
        }
      });

      it('rejects execution when current directory matches known production installation directory (PROD_PROJECT_DIR)', async () => {
        fs.writeFileSync(
          path.join(sandboxDir, 'ecosystem.staging.config.js'),
          'module.exports = { apps: [{ name: "cmd-staging-backend" }, { name: "cmd-staging-frontend" }] };'
        );
        const scriptPosix = toPosixPath(preflightScriptPath);
        const sandboxPosix = toPosixPath(sandboxDir);

        const res = await runBash(
          `PATH="${mockBinPosix}:$PATH" bash "${scriptPosix}"`,
          sandboxDir,
          {
            PROJECT_DIR: sandboxPosix,
            PROD_PROJECT_DIR: sandboxPosix, // Simulate current dir being configured production dir
          }
        );

        expect(res.code).toBe(1);
        expect(res.stdout).toContain('[CRITICAL ISOLATION BREACH] Staging preflight detected running in production directory');
        expect(res.stdout).toContain('Executing staging scripts inside the production directory is strictly forbidden.');
      });

      it('rejects execution in deploy-staging.sh when current directory matches PROD_PROJECT_DIR', async () => {
        const scriptPosix = toPosixPath(deployScriptPath);
        const sandboxPosix = toPosixPath(sandboxDir);

        const res = await runBash(
          `PATH="${mockBinPosix}:$PATH" bash "${scriptPosix}"`,
          sandboxDir,
          {
            PROJECT_DIR: sandboxPosix,
            PROD_PROJECT_DIR: sandboxPosix,
          }
        );

        expect(res.code).toBe(1);
        expect(res.stdout).toContain('[CRITICAL ISOLATION BREACH] Staging deployment attempted in production directory');
        expect(res.stdout).toContain('Refusing deployment to protect production application.');
      });

      it('rejects execution in an unexpected directory that does not identify as staging', async () => {
        // Create an unapproved directory path WITHOUT the words 'staging', 'stage', or 'test'
        const unapprovedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'unapproved-workspace-'));
        const unapprovedDir = path.join(unapprovedRoot, 'custom-app-root');
        fs.mkdirSync(unapprovedDir, { recursive: true });
        initSandboxWorkspace(unapprovedDir);
        fs.writeFileSync(
          path.join(unapprovedDir, 'ecosystem.staging.config.js'),
          'module.exports = { apps: [{ name: "cmd-staging-backend" }, { name: "cmd-staging-frontend" }] };'
        );

        const scriptPosix = toPosixPath(preflightScriptPath);
        const unapprovedPosix = toPosixPath(unapprovedDir);

        try {
          const res = await runBash(
            `PATH="${mockBinPosix}:$PATH" bash "${scriptPosix}"`,
            unapprovedDir,
            {
              PROJECT_DIR: unapprovedPosix,
              ALLOW_CUSTOM_STAGING_DIR: '0',
            }
          );

          expect(res.code).toBe(1);
          expect(res.stdout).toContain('[CRITICAL ERROR] Current directory');
          expect(res.stdout).toContain('is not an approved staging installation directory');
        } finally {
          fs.rmSync(unapprovedRoot, { recursive: true, force: true });
        }
      });

      it('rejects execution when required staging environment file (.env.staging) is missing', async () => {
        const approvedStagingDir = path.join(sandboxDir, 'cmd-dashboard-staging');
        fs.mkdirSync(approvedStagingDir, { recursive: true });
        initSandboxWorkspace(approvedStagingDir);
        fs.writeFileSync(
          path.join(approvedStagingDir, 'ecosystem.staging.config.js'),
          'module.exports = { apps: [{ name: "cmd-staging-backend" }, { name: "cmd-staging-frontend" }] };'
        );

        // Intentionally do NOT create .env.staging or backend/.env.staging
        const scriptPosix = toPosixPath(preflightScriptPath);
        const approvedPosix = toPosixPath(approvedStagingDir);

        const res = await runBash(
          `PATH="${mockBinPosix}:$PATH" bash "${scriptPosix}"`,
          approvedStagingDir,
          {
            PROJECT_DIR: approvedPosix,
          }
        );

        expect(res.code).toBe(1);
        expect(res.stdout).toContain('[CRITICAL ERROR] Dedicated staging environment file not found!');
        expect(res.stdout).toContain('Expected backend/.env.staging or .env.staging.');
        expect(res.stdout).toContain('Automatic fallback to backend/.env (production) is strictly forbidden.');
      });

      it('rejects execution when DATABASE_URL targets production database (cmd_office)', async () => {
        const approvedStagingDir = path.join(sandboxDir, 'cmd-dashboard-staging');
        fs.mkdirSync(approvedStagingDir, { recursive: true });
        initSandboxWorkspace(approvedStagingDir);
        fs.writeFileSync(
          path.join(approvedStagingDir, 'ecosystem.staging.config.js'),
          'module.exports = { apps: [{ name: "cmd-staging-backend" }, { name: "cmd-staging-frontend" }] };'
        );

        // Point to production DB 'cmd_office'
        const invalidEnvContent = [
          'DATABASE_URL="postgresql://cmd_staging_user:StagingPass@127.0.0.1:5432/cmd_office?schema=public"',
          'PORT=4001',
          'FRONTEND_URL="http://127.0.0.1:3001"',
          'JWT_SECRET="staging_test_secret_32_characters_long"',
          'JWT_REFRESH_SECRET="staging_refresh_secret_32_characters_long"',
        ].join('\n');

        fs.writeFileSync(path.join(approvedStagingDir, '.env.staging'), invalidEnvContent);
        fs.writeFileSync(path.join(approvedStagingDir, 'backend/.env.staging'), invalidEnvContent);

        const scriptPosix = toPosixPath(preflightScriptPath);
        const approvedPosix = toPosixPath(approvedStagingDir);

        const res = await runBash(
          `PATH="${mockBinPosix}:$PATH" bash "${scriptPosix}"`,
          approvedStagingDir,
          {
            PROJECT_DIR: approvedPosix,
          }
        );

        expect(res.code).toBe(1);
        expect(res.stdout).toContain("[CRITICAL ISOLATION BREACH REJECTED] Staging cannot connect to production or default database 'cmd_office'!");
      });

      it('rejects execution when DATABASE_URL uses superuser postgres', async () => {
        const approvedStagingDir = path.join(sandboxDir, 'cmd-dashboard-staging');
        fs.mkdirSync(approvedStagingDir, { recursive: true });
        initSandboxWorkspace(approvedStagingDir);
        fs.writeFileSync(
          path.join(approvedStagingDir, 'ecosystem.staging.config.js'),
          'module.exports = { apps: [{ name: "cmd-staging-backend" }, { name: "cmd-staging-frontend" }] };'
        );

        // Uses postgres user with valid staging db name (cmd_staging)
        const invalidEnvContent = [
          'DATABASE_URL="postgresql://postgres:SecretPass@127.0.0.1:5432/cmd_staging?schema=public"',
          'PORT=4001',
          'FRONTEND_URL="http://127.0.0.1:3001"',
          'JWT_SECRET="staging_test_secret_32_characters_long"',
          'JWT_REFRESH_SECRET="staging_refresh_secret_32_characters_long"',
        ].join('\n');

        fs.writeFileSync(path.join(approvedStagingDir, '.env.staging'), invalidEnvContent);
        fs.writeFileSync(path.join(approvedStagingDir, 'backend/.env.staging'), invalidEnvContent);

        const scriptPosix = toPosixPath(preflightScriptPath);
        const approvedPosix = toPosixPath(approvedStagingDir);

        const res = await runBash(
          `PATH="${mockBinPosix}:$PATH" bash "${scriptPosix}"`,
          approvedStagingDir,
          {
            PROJECT_DIR: approvedPosix,
          }
        );

        expect(res.code).toBe(1);
        expect(res.stdout).toContain("[CRITICAL ISOLATION BREACH REJECTED] Staging cannot connect using superuser account 'postgres'!");
      });
    });
  });

  // =========================================================================
  // F-02: STAGING ROLLBACK INTERRUPTION SAFETY
  // =========================================================================
  describe('F-02: Staging Rollback Interruption Safety', () => {
    describe('Static Analysis of rollback-staging.sh', () => {
      it('verifies rollback-staging.sh registers traps for SIGHUP, SIGINT, SIGTERM, and failure EXIT', () => {
        const content = fs.readFileSync(rollbackScriptPath, 'utf8');

        expect(content).toContain("trap 'handle_staging_rollback_signal SIGHUP' SIGHUP");
        expect(content).toContain("trap 'handle_staging_rollback_signal SIGINT' SIGINT");
        expect(content).toContain("trap 'handle_staging_rollback_signal SIGTERM' SIGTERM");
        expect(content).toContain('trap cleanup_staging_rollback_on_failure EXIT');
      });

      it('verifies rollback-staging.sh assigns standard Unix signal exit codes (129, 130, 143)', () => {
        const content = fs.readFileSync(rollbackScriptPath, 'utf8');

        expect(content).toContain('SIGHUP)  SIGNAL_EXIT_CODE=129');
        expect(content).toContain('SIGINT)  SIGNAL_EXIT_CODE=130');
        expect(content).toContain('SIGTERM) SIGNAL_EXIT_CODE=143');
      });

      it('verifies rollback-staging.sh preserves .prev artifacts by copying to .rollback.tmp without destructive overwrite', () => {
        const content = fs.readFileSync(rollbackScriptPath, 'utf8');

        expect(content).toContain('cp -r backend/dist.prev backend/dist.rollback.tmp');
        expect(content).toContain('cp -r frontend/.next.prev frontend/.next.rollback.tmp');
        expect(content).toContain('backend/dist.old');
        expect(content).toContain('frontend/.next.old');
      });

      it('verifies rollback-staging.sh performs release identity check against BUILD_ID manifest', () => {
        const content = fs.readFileSync(rollbackScriptPath, 'utf8');

        expect(content).toContain('PREV_BUILD_ID=$(cat "frontend/.next.prev/BUILD_ID" 2>/dev/null || echo "")');
        expect(content).toContain('_next/static/${PREV_BUILD_ID}/_buildManifest.js');
      });

      it('verifies rollback-staging.sh explicitly reloads staging PM2 processes and not production processes', () => {
        const content = fs.readFileSync(rollbackScriptPath, 'utf8');

        expect(content).toContain('pm2 reload ecosystem.staging.config.js');
        expect(content).toContain('cmd-staging-backend');
        expect(content).toContain('cmd-staging-frontend');
      });

      it('verifies rollback-staging.sh documents non-atomic POSIX filesystem swap recovery window', () => {
        const content = fs.readFileSync(rollbackScriptPath, 'utf8');

        expect(content).toContain('NON-ATOMIC RECOVERY WINDOW DOCUMENTATION');
        expect(content).toContain('In POSIX user-space, sequentially moving two directories');
        expect(content).toContain('Catchable interruptions');
        expect(content).toContain('Non-catchable events (SIGKILL, kernel panic, sudden host power loss)');
      });
    });

    describe('Dynamic Interruption & Failure Handling', () => {
      let sandboxDir: string;

      beforeEach(() => {
        sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-rollback-test-'));
      });

      afterEach(() => {
        if (fs.existsSync(sandboxDir)) {
          fs.rmSync(sandboxDir, { recursive: true, force: true });
        }
      });

      it('aborts before swapping when .prev artifacts are missing or corrupt', async () => {
        // Create active artifacts but NO .prev artifacts
        fs.mkdirSync(path.join(sandboxDir, 'backend/dist'), { recursive: true });
        fs.mkdirSync(path.join(sandboxDir, 'frontend/.next'), { recursive: true });
        fs.writeFileSync(path.join(sandboxDir, 'backend/dist/main.js'), 'CURRENT_ACTIVE_BACKEND');
        fs.writeFileSync(path.join(sandboxDir, 'frontend/.next/BUILD_ID'), 'CURRENT_ACTIVE_FRONTEND');

        const scriptPosix = toPosixPath(rollbackScriptPath);

        const res = await runBash(
          `bash "${scriptPosix}"`,
          sandboxDir
        );

        expect(res.code).toBe(1);
        expect(res.stdout).toContain('[CRITICAL ERROR] Preserved previous staging artifacts (backend/dist.prev or frontend/.next.prev) are missing!');
        // Active artifacts remain untouched
        expect(fs.readFileSync(path.join(sandboxDir, 'backend/dist/main.js'), 'utf8')).toBe('CURRENT_ACTIVE_BACKEND');
        expect(fs.readFileSync(path.join(sandboxDir, 'frontend/.next/BUILD_ID'), 'utf8')).toBe('CURRENT_ACTIVE_FRONTEND');
        // No temporary rollback files left behind
        expect(fs.existsSync(path.join(sandboxDir, 'backend/dist.rollback.tmp'))).toBe(false);
      });

      it('recovers active artifacts cleanly if failure occurs during directory swap', async () => {
        // Setup valid .prev artifacts
        fs.mkdirSync(path.join(sandboxDir, 'backend/dist.prev/src'), { recursive: true });
        fs.writeFileSync(path.join(sandboxDir, 'backend/dist.prev/src/main.js'), 'PREV_VALID_BACKEND');
        fs.writeFileSync(path.join(sandboxDir, 'backend/dist.prev/src/app.module.js'), 'PREV_MODULE');

        fs.mkdirSync(path.join(sandboxDir, 'frontend/.next.prev/server'), { recursive: true });
        fs.mkdirSync(path.join(sandboxDir, 'frontend/.next.prev/static'), { recursive: true });
        fs.writeFileSync(path.join(sandboxDir, 'frontend/.next.prev/BUILD_ID'), 'PREV_BUILD_123');

        // Setup current active artifacts
        fs.mkdirSync(path.join(sandboxDir, 'backend/dist/src'), { recursive: true });
        fs.writeFileSync(path.join(sandboxDir, 'backend/dist/src/main.js'), 'CURRENT_ACTIVE_BACKEND');

        fs.mkdirSync(path.join(sandboxDir, 'frontend/.next/server'), { recursive: true });
        fs.writeFileSync(path.join(sandboxDir, 'frontend/.next/BUILD_ID'), 'CURRENT_ACTIVE_FRONTEND');

        // Run rollback with simulated failure during PM2 step (which triggers the EXIT failure trap)
        const scriptPosix = toPosixPath(rollbackScriptPath);
        const res = await runBash(
          `
          # Shadow pm2 to fail
          pm2() {
            echo "Mock PM2 reload failed!" >&2
            return 1
          }
          export -f pm2
          bash "${scriptPosix}"
          `,
          sandboxDir
        );

        expect(res.code).toBe(1);
        expect(res.stderr).toContain('Mock PM2 reload failed!');
        expect(res.stdout).toContain('[STAGING ROLLBACK CLEANUP] Cleaning temporary recovery artifacts...');

        // Crucial invariant: The known-good .prev artifacts were preserved untouched!
        expect(fs.existsSync(path.join(sandboxDir, 'backend/dist.prev/src/main.js'))).toBe(true);
        expect(fs.existsSync(path.join(sandboxDir, 'frontend/.next.prev/BUILD_ID'))).toBe(true);
      });

      it('fails closed with exit code 1 when health-check endpoints fail to respond', async () => {
        // Setup complete valid .prev artifacts
        fs.mkdirSync(path.join(sandboxDir, 'backend/dist.prev/src'), { recursive: true });
        fs.writeFileSync(path.join(sandboxDir, 'backend/dist.prev/src/main.js'), 'PREV_VALID_BACKEND');
        fs.writeFileSync(path.join(sandboxDir, 'backend/dist.prev/src/app.module.js'), 'PREV_MODULE');

        fs.mkdirSync(path.join(sandboxDir, 'frontend/.next.prev/server'), { recursive: true });
        fs.mkdirSync(path.join(sandboxDir, 'frontend/.next.prev/static'), { recursive: true });
        fs.writeFileSync(path.join(sandboxDir, 'frontend/.next.prev/BUILD_ID'), 'PREV_BUILD_123');

        // Create dummy ecosystem.staging.config.js
        fs.writeFileSync(
          path.join(sandboxDir, 'ecosystem.staging.config.js'),
          'module.exports = { apps: [] };'
        );

        const scriptPosix = toPosixPath(rollbackScriptPath);

        // Run with mock pm2 succeeding, but override sleep to 0s for fast test execution
        const res = await runBash(
          `
          pm2() { return 0; }
          sleep() { :; }
          export -f pm2 sleep
          bash "${scriptPosix}"
          `,
          sandboxDir
        );

        expect(res.code).toBe(1);
        expect(res.stdout).toContain('Staging health check attempt 1 of 5');
        expect(res.stdout).toContain('Staging health check attempt 5 of 5');
        expect(res.stdout).toContain('[CRITICAL ERROR] Staging rollback health check failed!');
        expect(res.stdout).toContain('Application did not respond 200 OK or manifest failed verification.');
      });
    });
  });

  // =========================================================================
  // F-03: STAGING ENVIRONMENT-FILE PROTECTION (.gitignore)
  // =========================================================================
  describe('F-03: Environment-File Protection (.gitignore)', () => {
    it('verifies staging environment files are matched and ignored by git', async () => {
      const filesToCheck = [
        '.env.staging',
        '.env.staging.local',
        'backend/.env.staging',
        'frontend/.env.staging',
        'custom.env.staging',
        '.prev-staging-commit',
      ];

      for (const file of filesToCheck) {
        const res = await runBash(`git check-ignore "${file}"`);
        expect(res.code).toBe(0);
        expect(res.stdout.trim()).toBe(file);
      }
    });

    it('verifies example/template environment files are NOT ignored by git', async () => {
      const exampleFiles = [
        '.env.example',
        '.env.staging.example',
        'backend/.env.example',
        'backend/.env.staging.example',
      ];

      for (const file of exampleFiles) {
        const res = await runBash(`git check-ignore "${file}"`);
        // Exit code 1 means git did NOT ignore the file (it is preserved)
        expect(res.code).toBe(1);
      }
    });
  });
});
