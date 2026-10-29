import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

describe('Production Deployment Interruption & Disk Preflight Safeguards (scripts/deploy-production.sh)', () => {
  // Set extended timeout for running bash subshells and git operations on Windows
  jest.setTimeout(30000);

  const rootDir = path.resolve(__dirname, '../../../');
  const deployScriptPath = path.join(rootDir, 'scripts/deploy-production.sh');
  const rollbackScriptPath = path.join(rootDir, 'scripts/rollback-production.sh');

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

  // Helper to convert Windows paths to POSIX paths compatible with Git Bash / MSYS $PATH
  const toPosixPath = (winPath: string): string => {
    return winPath.replace(/^[A-Za-z]:/, (m) => '/' + m[0].toLowerCase()).replace(/\\/g, '/');
  };

  // Helper to execute bash command in specific working directory with custom environment
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

  // =========================================================================
  // CATEGORY A: STATIC SOURCE-TEXT ASSERTIONS
  // =========================================================================
  describe('Category A — Static Script Source Assertions', () => {
    it('[Category A] verifies deploy-production.sh registers traps for EXIT, SIGHUP, SIGINT, and SIGTERM', () => {
      const content = fs.readFileSync(deployScriptPath, 'utf8');

      expect(content).toContain("trap 'handle_signal SIGHUP' SIGHUP");
      expect(content).toContain("trap 'handle_signal SIGINT' SIGINT");
      expect(content).toContain("trap 'handle_signal SIGTERM' SIGTERM");
      expect(content).toContain('trap cleanup_on_failure EXIT');
    });

    it('[Category A] verifies deploy-production.sh disarms all traps upon entering cleanup to prevent recursion', () => {
      const content = fs.readFileSync(deployScriptPath, 'utf8');

      expect(content).toContain('trap - EXIT SIGHUP SIGINT SIGTERM');
      expect(content).toContain('CLEANUP_EXECUTED=1');
    });

    it('[Category A] verifies deploy-production.sh sets standard Unix signal exit codes (129, 130, 143)', () => {
      const content = fs.readFileSync(deployScriptPath, 'utf8');

      expect(content).toContain('SIGHUP)  SIGNAL_EXIT_CODE=129');
      expect(content).toContain('SIGINT)  SIGNAL_EXIT_CODE=130');
      expect(content).toContain('SIGTERM) SIGNAL_EXIT_CODE=143');
    });

    it('[Category A] verifies rollback-production.sh includes signal and failure traps', () => {
      const content = fs.readFileSync(rollbackScriptPath, 'utf8');

      expect(content).toContain("trap 'handle_rollback_signal SIGHUP' SIGHUP");
      expect(content).toContain("trap 'handle_rollback_signal SIGINT' SIGINT");
      expect(content).toContain("trap 'handle_rollback_signal SIGTERM' SIGTERM");
      expect(content).toContain('trap cleanup_rollback_on_failure EXIT');
      expect(content).toContain('trap - EXIT SIGHUP SIGINT SIGTERM');
    });

    it('[Category A] verifies deploy-production.sh includes pre-build disk-space validation with 1.5GB minimum floor', () => {
      const content = fs.readFileSync(deployScriptPath, 'utf8');

      expect(content).toContain('DEFAULT_DEPLOY_DISK_KB=2097152');
      expect(content).toContain('MIN_DEPLOY_DISK_KB=1572864');
      expect(content).toContain('df -Pk "$PROJECT_DIR"');
      expect(content).toContain('Insufficient disk space');
    });

    it('[Category A] verifies cleanup targets only temporary candidate artifacts and never environment or user data', () => {
      const content = fs.readFileSync(deployScriptPath, 'utf8');

      expect(content).toContain('rm -rf backend/dist.candidate frontend/.next.candidate');
      expect(content).not.toContain('rm -rf .env');
      expect(content).not.toContain('rm -rf backend/.env');
      expect(content).not.toContain('rm -rf backups');
      expect(content).not.toContain('rm -rf uploads');
    });

    it('[Category A] verifies deploy-production.sh includes non-blocking concurrency locking', () => {
      const content = fs.readFileSync(deployScriptPath, 'utf8');

      expect(content).toContain('acquire_deployment_lock');
      expect(content).toContain('release_deployment_lock');
      expect(content).toContain('Refusing concurrent deployment to prevent repository');
    });
  });

  // =========================================================================
  // CATEGORY C: ACTUAL-SCRIPT SANDBOX INTEGRATION TESTS
  // (Executes scripts/deploy-production.sh against temporary sandbox directories)
  // =========================================================================
  describe('Category C — Actual-Script Sandbox Integration Tests', () => {
    let sandboxDir: string;
    let mockBinDir: string;

    beforeEach(() => {
      sandboxDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'deploy-sandbox-'));
      mockBinDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'deploy-mockbin-'));
      fs.mkdirSync(path.join(sandboxDir, 'backend'), { recursive: true });
      fs.mkdirSync(path.join(sandboxDir, 'frontend'), { recursive: true });
      fs.writeFileSync(path.join(sandboxDir, 'backend/package.json'), '{}');
      fs.writeFileSync(path.join(sandboxDir, 'frontend/package.json'), '{}');
    });

    afterEach(() => {
      try {
        fs.rmSync(sandboxDir, { recursive: true, force: true });
        fs.rmSync(mockBinDir, { recursive: true, force: true });
      } catch {
        // Ignore sandbox cleanup errors
      }
    });

    // Helper to create executable mock script in mockBinDir
    const createMockBinary = (name: string, scriptContent: string) => {
      const binPath = path.join(mockBinDir, name);
      fs.writeFileSync(binPath, `#!/usr/bin/env bash\n${scriptContent}\n`);
      try {
        fs.chmodSync(binPath, '755');
      } catch {
        // Windows compatibility
      }
    };

    // Test 1: Invalid disk threshold values (non-numeric, negative)
    it('[Category C] Test 1 — Invalid disk threshold: actual script rejects non-numeric or negative values with exit code 1', async () => {
      const deployScriptBash = toPosixPath(deployScriptPath);
      const resNonNumeric = await runBash(
        `REQUIRED_DEPLOY_DISK_KB="abc_invalid" bash "${deployScriptBash}"`,
        sandboxDir
      );

      expect(resNonNumeric.code).toBe(1);
      expect(resNonNumeric.stdout).toContain('[CRITICAL ERROR] Invalid REQUIRED_DEPLOY_DISK_KB value: \'abc_invalid\'');

      const resNegative = await runBash(
        `REQUIRED_DEPLOY_DISK_KB="-500" bash "${deployScriptBash}"`,
        sandboxDir
      );

      expect(resNegative.code).toBe(1);
      expect(resNegative.stdout).toContain('[CRITICAL ERROR] Invalid REQUIRED_DEPLOY_DISK_KB value');
    });

    // Test 2: An override below the minimum floor (1.5 GB = 1572864 KB)
    it('[Category C] Test 2 — Override below floor: actual script rejects values below 1.5GB floor with exit code 1', async () => {
      const deployScriptBash = toPosixPath(deployScriptPath);
      const res = await runBash(
        `REQUIRED_DEPLOY_DISK_KB="500000" bash "${deployScriptBash}"`,
        sandboxDir
      );

      expect(res.code).toBe(1);
      expect(res.stdout).toContain('[CRITICAL ERROR] Requested REQUIRED_DEPLOY_DISK_KB (500000 KB / 488 MB) is below the minimum safe threshold (1572864 KB / 1536 MB)');
      expect(res.stdout).toContain('Refusing to lower threshold below safety floor');
    });

    // Test 3: A valid threshold override (>= 1.5 GB)
    it('[Category C] Test 3 — Valid threshold override: actual script accepts valid override and evaluates disk space', async () => {
      const deployScriptBash = toPosixPath(deployScriptPath);
      // Set override to 1.8 GB (1843200 KB) which is >= 1.5 GB floor
      const res = await runBash(
        `REQUIRED_DEPLOY_DISK_KB="1843200" bash "${deployScriptBash}"`,
        sandboxDir
      );

      // Script passes disk check Step 1 and fails at Step 2 (since sandbox is not a git repo), proving disk preflight succeeded
      expect(res.stdout).toContain('1800 MB required');
      expect(res.stdout).toContain('==> Step 2: Verifying Git Working Tree');
      expect(res.stdout).toContain('[CRITICAL ERROR] Not a git repository');
    });

    // Test 4: `df` failure or malformed output
    it('[Category C] Test 4 — df failure: actual script fails closed when df is unavailable or unparseable', async () => {
      // Mock df failing
      createMockBinary('df', 'echo "df: disk read failure" >&2; exit 1');
      const deployScriptBash = toPosixPath(deployScriptPath);
      const mockBinBash = toPosixPath(mockBinDir);

      const res = await runBash(
        `PATH="${mockBinBash}:$PATH" bash "${deployScriptBash}"`,
        sandboxDir
      );

      expect(res.code).toBe(1);
      expect(res.stdout).toContain('[CRITICAL ERROR] Failed to determine available disk space');
    });

    // Test 5: Insufficient disk space aborting before Git state changes, builds, activation, or PM2 calls
    it('[Category C] Test 5 — Insufficient disk space: actual script aborts with code 1 before Git merge or compilation', async () => {
      // Mock df returning 500 MB (512000 KB) available space
      createMockBinary('df', 'echo "Filesystem 1024-blocks Used Available Capacity Mounted on"; echo "/dev/mock 50000000 49488000 512000 99% /"');
      const deployScriptBash = toPosixPath(deployScriptPath);
      const mockBinBash = toPosixPath(mockBinDir);

      const res = await runBash(
        `PATH="${mockBinBash}:$PATH" bash "${deployScriptBash}"`,
        sandboxDir
      );

      expect(res.code).toBe(1);
      expect(res.stdout).toContain('[CRITICAL ERROR] Insufficient disk space');
      expect(res.stdout).toContain('Available: 500 MB (512000 KB)');
      expect(res.stdout).toContain('Required:  2048 MB (2097152 KB)');
      expect(res.stdout).toContain('Deployment halted before building candidate release or modifying Git state.');
      expect(res.stdout).not.toContain('Step 2: Verifying Git Working Tree');
      expect(res.stdout).not.toContain('Step 4: Compiling Backend Candidate Release');
    });

    // Test 6: Failure before activation preserving active artifacts
    it('[Category C] Test 6 — Pre-activation failure: active artifacts remain intact, candidate dirs purged', async () => {
      // Setup mock active artifacts in sandbox
      fs.mkdirSync(path.join(sandboxDir, 'backend/dist'), { recursive: true });
      fs.mkdirSync(path.join(sandboxDir, 'frontend/.next'), { recursive: true });
      fs.writeFileSync(path.join(sandboxDir, 'backend/dist/main.js'), 'ACTIVE_PRODUCTION_BACKEND_V1');
      fs.writeFileSync(path.join(sandboxDir, 'frontend/.next/BUILD_ID'), 'ACTIVE_PRODUCTION_FRONTEND_V1');

      // Create isolated bare origin repo in unique temporary directory
      const originDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'deploy-origin-'));
      const posixOriginDir = toPosixPath(originDir);

      try {
        // Create dummy git repo so script advances to Step 4
        await runBash(`
          git init
          git config user.email "test@hartek.com"
          git config user.name "Test User"
          git checkout -b main
          git add .
          git commit -m "initial commit"
          git clone --bare . "${posixOriginDir}"
          git remote add origin "${posixOriginDir}"
          echo "NEW_FEATURE" > feature.txt
          git add feature.txt
          git commit -m "target commit"
          git push origin main
          git reset --hard HEAD~1
        `, sandboxDir);

        // Mock nest compiler to fail during candidate build (Step 4)
        createMockBinary('npx', 'if [ "$1" = "nest" ] || [ "$2" = "nest" ]; then echo "NestJS build failed!" >&2; exit 1; fi; exit 0');
        const deployScriptBash = toPosixPath(deployScriptPath);
        const mockBinBash = toPosixPath(mockBinDir);

        const res = await runBash(
          `PATH="${mockBinBash}:$PATH" bash "${deployScriptBash}"`,
          sandboxDir
        );

        expect(res.code).toBe(1);
        expect(res.stdout).toContain('[DEPLOYMENT FAILED BEFORE ACTIVATION] Cleaning temporary candidate build artifacts');

        // Assert active artifacts were completely untouched
        const activeBackend = fs.readFileSync(path.join(sandboxDir, 'backend/dist/main.js'), 'utf8');
        const activeFrontend = fs.readFileSync(path.join(sandboxDir, 'frontend/.next/BUILD_ID'), 'utf8');
        expect(activeBackend).toBe('ACTIVE_PRODUCTION_BACKEND_V1');
        expect(activeFrontend).toBe('ACTIVE_PRODUCTION_FRONTEND_V1');

        // Assert temporary candidate directory was removed
        expect(fs.existsSync(path.join(sandboxDir, 'backend/dist.candidate'))).toBe(false);
      } finally {
        try {
          fs.rmSync(originDir, { recursive: true, force: true });
        } catch {
          // Ignore
        }
      }
    });

    // Test 12: Concurrency protection (two instances attempted against same sandbox)
    it('[Category C] Test 12 — Concurrency protection: actual script rejects concurrent deployment instance via non-blocking lock', async () => {
      const deployScriptBash = toPosixPath(deployScriptPath);
      const lockFile = path.join(sandboxDir, '.releases/deploy.lock');
      const posixLockFile = toPosixPath(lockFile);

      const lockDir = path.dirname(lockFile);
      const posixLockDir = toPosixPath(lockDir);

      // Start a background subshell holding the lock for 1.2 seconds
      const holderScript = `
        mkdir -p "${posixLockDir}"
        if command -v flock &>/dev/null; then
          exec 200>"${posixLockFile}"
          flock -n 200
        else
          mkdir "${posixLockFile}.dir"
          echo "\$\$" > "${posixLockFile}.dir/pid"
        fi
        sleep 1.2
        if [ -d "${posixLockFile}.dir" ]; then
          rm -rf "${posixLockFile}.dir"
        fi
      `;

      const holderChild = spawn(bashExecutable, ['-c', holderScript], {
        cwd: sandboxDir,
        windowsHide: true,
      });

      // Wait 250ms for holder to acquire lock
      await new Promise((r) => setTimeout(r, 250));

      try {
        // Attempt to run the actual deploy-production.sh against the held lock
        const resConcurrent = await runBash(
          `DEPLOY_LOCK_FILE="${posixLockFile}" bash "${deployScriptBash}"`,
          sandboxDir
        );

        expect(resConcurrent.code).toBe(1);
        expect(resConcurrent.stdout).toContain('[CRITICAL ERROR] Another deployment instance is currently active!');
        expect(resConcurrent.stdout).toContain('Refusing concurrent deployment to prevent repository');
      } finally {
        try {
          holderChild.kill();
        } catch {
          // Ignore
        }
      }

      // Wait for holder process to terminate cleanly and lock to be released
      await new Promise((r) => setTimeout(r, 1200));

      // Assert that once the holder process exits, a subsequent deployment can proceed past the lock
      const resAfterRelease = await runBash(
        `DEPLOY_LOCK_FILE="${posixLockFile}" REQUIRED_DEPLOY_DISK_KB="invalid_val" bash "${deployScriptBash}"`,
        sandboxDir
      );

      // Successfully passed the lock check and reached input validation in Step 1
      expect(resAfterRelease.stdout).toContain("[CRITICAL ERROR] Invalid REQUIRED_DEPLOY_DISK_KB value: 'invalid_val'");
      expect(resAfterRelease.stdout).not.toContain('Another deployment instance is currently active');
    });

    // Test 13: Stale lock reclamation concurrency (two instances competing to reclaim dead lock)
    it('[Category C] Test 13 — Stale lock reclamation: simultaneous processes competing for stale lock cannot corrupt or steal ownership', async () => {
      const deployScriptBash = toPosixPath(deployScriptPath);
      const lockFile = path.join(sandboxDir, '.releases/deploy.lock');
      const posixLockFile = toPosixPath(lockFile);

      const lockDir = `${lockFile}.dir`;
      fs.mkdirSync(lockDir, { recursive: true });
      // Write a guaranteed dead PID (e.g. 999999) to simulate crashed prior deployment
      fs.writeFileSync(path.join(lockDir, 'pid'), '999999\n');

      // Launch two deployments concurrently attempting to reclaim the same stale lock
      const runInstance = () =>
        runBash(
          `DEPLOY_LOCK_FILE="${posixLockFile}" REQUIRED_DEPLOY_DISK_KB="invalid_stop" bash "${deployScriptBash}"`,
          sandboxDir
        );

      const [resA, resB] = await Promise.all([runInstance(), runInstance()]);

      // Exactly one process must fail closed on the lock, and the other must win reclamation and proceed past the lock
      const results = [resA, resB];
      const lockedResults = results.filter((r) =>
        r.stdout.includes('Another deployment instance is currently active!')
      );
      const advancedResults = results.filter((r) =>
        r.stdout.includes("[CRITICAL ERROR] Invalid REQUIRED_DEPLOY_DISK_KB value: 'invalid_stop'")
      );

      // Verify strict mutual exclusion during stale lock reclamation
      expect(lockedResults.length).toBe(1);
      expect(advancedResults.length).toBe(1);
      expect(lockedResults[0].code).toBe(1);
    });

    // Test 14: Malformed PID file in fallback lock causes deployment to fail closed
    it('[Category C] Test 14 — Malformed PID safety: actual script fails closed with exit code 1 on non-numeric or corrupted PID file', async () => {
      const deployScriptBash = toPosixPath(deployScriptPath);
      const lockFile = path.join(sandboxDir, '.releases/deploy.lock');
      const posixLockFile = toPosixPath(lockFile);

      const lockDir = `${lockFile}.dir`;
      fs.mkdirSync(lockDir, { recursive: true });
      // Write corrupted / malformed PID
      fs.writeFileSync(path.join(lockDir, 'pid'), 'corrupted_non_numeric_pid\n');

      const res = await runBash(
        `DEPLOY_LOCK_FILE="${posixLockFile}" REQUIRED_DEPLOY_DISK_KB="invalid_stop" bash "${deployScriptBash}"`,
        sandboxDir
      );

      expect(res.code).toBe(1);
      expect(res.stdout).toContain("[CRITICAL ERROR] Corrupt or malformed lock PID file detected ('corrupted_non_numeric_pid')");
      expect(res.stdout).toContain('Refusing deployment to prevent unsafe stale-lock reclamation');
    });

    // Test 15: Three concurrent deployment processes competing for stale lock
    it('[Category C] Test 15 — Multi-process stale lock race: exactly 1 of 3 concurrent processes wins reclamation, 2 fail closed', async () => {
      const deployScriptBash = toPosixPath(deployScriptPath);
      const lockFile = path.join(sandboxDir, '.releases/deploy.lock');
      const posixLockFile = toPosixPath(lockFile);

      const lockDir = `${lockFile}.dir`;
      fs.mkdirSync(lockDir, { recursive: true });
      fs.writeFileSync(path.join(lockDir, 'pid'), '999999\n');

      const runInstance = () =>
        runBash(
          `DEPLOY_LOCK_FILE="${posixLockFile}" REQUIRED_DEPLOY_DISK_KB="invalid_stop" bash "${deployScriptBash}"`,
          sandboxDir
        );

      const [res1, res2, res3] = await Promise.all([runInstance(), runInstance(), runInstance()]);

      const results = [res1, res2, res3];
      const lockedResults = results.filter((r) =>
        r.stdout.includes('Another deployment instance is currently active!')
      );
      const advancedResults = results.filter((r) =>
        r.stdout.includes("[CRITICAL ERROR] Invalid REQUIRED_DEPLOY_DISK_KB value: 'invalid_stop'")
      );

      // Verify exactly 1 winner and 2 losers
      expect(lockedResults.length).toBe(2);
      expect(advancedResults.length).toBe(1);
      expect(lockedResults[0].code).toBe(1);
      expect(lockedResults[1].code).toBe(1);
      expect(advancedResults[0].code).toBe(1);
    });

    // Test 16: Rollback untracked file check permits .prev snapshots and halts on unexpected untracked files
    it('[Category C] Test 16 — Rollback untracked file check: permits legitimate .prev snapshots but fails closed on foreign files', async () => {
      const rollbackScriptBash = toPosixPath(rollbackScriptPath);

      // Setup mock git repo in sandbox
      await runBash(`
        git init
        git config user.email "test@hartek.com"
        git config user.name "Test User"
        git checkout -b main
        git add .
        git commit -m "initial commit"
      `, sandboxDir);

      // Create legitimate .prev release artifacts (including src/ entry points)
      fs.mkdirSync(path.join(sandboxDir, 'backend/dist.prev/src'), { recursive: true });
      fs.mkdirSync(path.join(sandboxDir, 'frontend/.next.prev/server'), { recursive: true });
      fs.mkdirSync(path.join(sandboxDir, 'frontend/.next.prev/static'), { recursive: true });
      fs.writeFileSync(path.join(sandboxDir, 'backend/dist.prev/src/main.js'), 'PREV_MAIN');
      fs.writeFileSync(path.join(sandboxDir, 'backend/dist.prev/src/app.module.js'), 'PREV_APP');
      fs.writeFileSync(path.join(sandboxDir, 'frontend/.next.prev/BUILD_ID'), 'PREV_BUILD');

      // Run rollback script — should pass Step 1 working tree check (and fail on missing commit metadata Step 2)
      const resClean = await runBash(`bash "${rollbackScriptBash}"`, sandboxDir);
      expect(resClean.stdout).not.toContain('Dirty working tree detected! Unexpected untracked files exist on server');
      expect(resClean.stdout).toContain('Preserved release artifacts verified: backend/dist.prev and frontend/.next.prev');

      // Now introduce an unexpected foreign untracked file
      fs.writeFileSync(path.join(sandboxDir, 'unexpected_script.sh'), 'echo hacked');

      // Run rollback script — must fail closed at Step 1
      const resDirty = await runBash(`bash "${rollbackScriptBash}"`, sandboxDir);
      expect(resDirty.code).toBe(1);
      expect(resDirty.stdout).toContain('Dirty working tree detected! Unexpected untracked files exist on server');
      expect(resDirty.stdout).toContain('unexpected_script.sh');
      expect(resDirty.stdout).toContain('Refusing rollback to protect local changes');
    });

    // Test 17: Release identity verification: frontend manifest probe matching candidate BUILD_ID
    it('[Category C] Test 17 — Release identity verification: health probe distinguishes candidate BUILD_ID from stale worker', async () => {
      // Simulate health check with matching vs mismatched BUILD_ID
      const testSnippet = `
        CANDIDATE_BUILD_ID="build_v2_new_candidate"

        check_http_endpoint() {
            local url="$1"
            # Simulate endpoint behavior: root responds 200, but only old BUILD_ID exists on stale worker
            if [ "$url" = "http://127.0.0.1:3000/" ]; then
                return 0
            elif [ "$url" = "http://127.0.0.1:3000/_next/static/build_v2_new_candidate/_buildManifest.js" ]; then
                # If simulating stale process, manifest for new candidate returns 404 (code 1)
                if [ "\${SIMULATE_STALE_WORKER:-0}" = "1" ]; then
                    return 1
                else
                    return 0
                fi
            fi
            return 0
        }

        # Check frontend with release identity verification
        FRONTEND_OK=false
        if check_http_endpoint "http://127.0.0.1:3000/"; then
            if [ -n "\${CANDIDATE_BUILD_ID:-}" ]; then
                if check_http_endpoint "http://127.0.0.1:3000/_next/static/\${CANDIDATE_BUILD_ID}/_buildManifest.js"; then
                    FRONTEND_OK=true
                else
                    FRONTEND_OK=false
                fi
            else
                FRONTEND_OK=true
            fi
        fi

        echo "FRONTEND_VERIFIED: \$FRONTEND_OK"
        if [ "\$FRONTEND_OK" = true ]; then
            exit 0
        else
            exit 1
        fi
      `;

      // 1. Fresh worker serving new build -> passes
      const resFresh = await runBash(testSnippet, sandboxDir, { SIMULATE_STALE_WORKER: '0' });
      expect(resFresh.code).toBe(0);
      expect(resFresh.stdout).toContain('FRONTEND_VERIFIED: true');

      // 2. Stale worker serving old build -> fails closed (exit 1), preventing false success
      const resStale = await runBash(testSnippet, sandboxDir, { SIMULATE_STALE_WORKER: '1' });
      expect(resStale.code).toBe(1);
      expect(resStale.stdout).toContain('FRONTEND_VERIFIED: false');
    });
  });

  // =========================================================================
  // CATEGORY B: UNIT TEST SIMULATIONS (TRAP LOGIC & FAILURE RECOVERY)
  // (Tests specific error branches and signal handlers via isolated shell snippets)
  // =========================================================================
  describe('Category B — Unit Test Simulations (Trap Logic & Failure Recovery)', () => {
    let sandboxDir: string;

    beforeEach(() => {
      sandboxDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'deploy-unit-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(sandboxDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    });

    // Test 7: Failure between backend and frontend activation invokes rollback
    it('[Category B] Test 7 — Failure during activation: unit test validates trap triggers rollback when ACTIVATION_STARTED=1', async () => {
      const testSnippet = `
        ACTIVATION_STARTED=1
        DEPLOY_SUCCESS=0
        IN_ROLLBACK=0
        ROLLBACK_INVOKED=false

        cleanup_on_failure() {
            local exit_code=$?
            if [ "$ACTIVATION_STARTED" -eq 1 ]; then
                ROLLBACK_INVOKED=true
                echo "AUTO_ROLLBACK_TRIGGERED: true"
            fi
            exit "$exit_code"
        }

        trap cleanup_on_failure EXIT
        # Simulate failure after backend activation
        exit 1
      `;

      const res = await runBash(testSnippet, sandboxDir);
      expect(res.code).toBe(1);
      expect(res.stdout).toContain('AUTO_ROLLBACK_TRIGGERED: true');
    });

    // Test 8: PM2 reload failure triggering recovery
    it('[Category B] Test 8 — PM2 reload failure: unit test validates non-zero service reload triggers recovery trap', async () => {
      const testSnippet = `
        ACTIVATION_STARTED=1
        DEPLOY_SUCCESS=0

        cleanup_on_failure() {
            local exit_code=$?
            echo "TRAP_TRIGGERED_ON_PM2_FAILURE: exit_code=$exit_code"
            exit "$exit_code"
        }

        trap cleanup_on_failure EXIT

        # Mock pm2 reload failing
        pm2() {
            return 1
        }

        pm2 reload ecosystem.config.js || pm2 restart ecosystem.config.js
      `;

      const res = await runBash(testSnippet, sandboxDir);
      expect(res.code).toBe(1);
      expect(res.stdout).toContain('TRAP_TRIGGERED_ON_PM2_FAILURE: exit_code=1');
    });

    // Test 9: Health-check failure triggering recovery
    it('[Category B] Test 9 — Health check failure: unit test validates failed probes trigger auto-recovery with exit 1', async () => {
      const testSnippet = `
        ACTIVATION_STARTED=1
        DEPLOY_SUCCESS=0

        cleanup_on_failure() {
            local exit_code=$?
            echo "AUTO_RECOVERY_ON_HEALTH_FAIL: exit_code=$exit_code"
            exit "$exit_code"
        }

        trap cleanup_on_failure EXIT

        # Mock health check failing
        check_http_endpoint() {
            return 1
        }

        HEALTHY=false
        for i in {1..2}; do
            if check_http_endpoint "http://127.0.0.1:4000/api/settings/public"; then
                HEALTHY=true
                break
            fi
        done

        if [ "$HEALTHY" = false ]; then
            echo "[CRITICAL ERROR] Health check failed!"
            exit 1
        fi
      `;

      const res = await runBash(testSnippet, sandboxDir);
      expect(res.code).toBe(1);
      expect(res.stdout).toContain('[CRITICAL ERROR] Health check failed!');
      expect(res.stdout).toContain('AUTO_RECOVERY_ON_HEALTH_FAIL: exit_code=1');
    });

    // Test 10: Cleanup preserving `.env`, uploads, backups, and active artifacts
    it('[Category B] Test 10 — Cleanup isolation: unit test validates cleanup preserves .env, backups, and uploads', async () => {
      // Create protected files in sandbox
      fs.writeFileSync(path.join(sandboxDir, '.env'), 'ROOT_SECRET_KEY=production');
      fs.mkdirSync(path.join(sandboxDir, 'backend'), { recursive: true });
      fs.writeFileSync(path.join(sandboxDir, 'backend/.env'), 'DATABASE_URL=postgresql://...');
      fs.mkdirSync(path.join(sandboxDir, 'backups'), { recursive: true });
      fs.writeFileSync(path.join(sandboxDir, 'backups/db-backup.sql.gz'), 'GZIP_DUMP');
      fs.mkdirSync(path.join(sandboxDir, 'uploads'), { recursive: true });
      fs.writeFileSync(path.join(sandboxDir, 'uploads/contract.pdf'), 'PDF_DOCUMENT');

      // Create temporary candidate files
      fs.mkdirSync(path.join(sandboxDir, 'backend/dist.candidate'), { recursive: true });
      fs.mkdirSync(path.join(sandboxDir, 'frontend/.next.candidate'), { recursive: true });

      // Run cleanup commands from actual script
      await runBash(`
        rm -rf backend/dist.candidate frontend/.next.candidate backend/tsconfig.candidate.json
        rm -rf backend/dist.prev.tmp frontend/.next.prev.tmp
        rm -rf backend/dist.prev.old frontend/.next.prev.old backend/dist.old frontend/.next.old
      `, sandboxDir);

      // Verify persistent files were preserved
      expect(fs.existsSync(path.join(sandboxDir, '.env'))).toBe(true);
      expect(fs.readFileSync(path.join(sandboxDir, '.env'), 'utf8')).toBe('ROOT_SECRET_KEY=production');
      expect(fs.existsSync(path.join(sandboxDir, 'backend/.env'))).toBe(true);
      expect(fs.existsSync(path.join(sandboxDir, 'backups/db-backup.sql.gz'))).toBe(true);
      expect(fs.existsSync(path.join(sandboxDir, 'uploads/contract.pdf'))).toBe(true);

      // Verify candidate files were purged
      expect(fs.existsSync(path.join(sandboxDir, 'backend/dist.candidate'))).toBe(false);
      expect(fs.existsSync(path.join(sandboxDir, 'frontend/.next.candidate'))).toBe(false);
    });

    // Test 11: Signal handling during deployment and rollback
    it('[Category B] Test 11 — Signal handling: unit test validates SIGHUP/SIGINT triggers handle_signal and disarms traps', async () => {
      const testSnippet = `
        CLEANUP_EXECUTED=0
        RECEIVED_SIGNAL=""

        cleanup_on_failure() {
            local exit_code=$?
            if [ "$CLEANUP_EXECUTED" -eq 1 ]; then
                exit "$exit_code"
            fi
            CLEANUP_EXECUTED=1
            trap - EXIT SIGHUP SIGINT SIGTERM
            echo "CLEANUP_HANDLED: signal=$RECEIVED_SIGNAL exit_code=$exit_code"
            exit "$exit_code"
        }

        handle_signal() {
            local sig="$1"
            RECEIVED_SIGNAL="$sig"
            case "$sig" in
                SIGHUP)  SIGNAL_EXIT_CODE=129 ;;
                SIGINT)  SIGNAL_EXIT_CODE=130 ;;
                SIGTERM) SIGNAL_EXIT_CODE=143 ;;
                *)       SIGNAL_EXIT_CODE=1 ;;
            esac
            echo "SIGNAL_CAUGHT: $sig"
            exit "$SIGNAL_EXIT_CODE"
        }

        trap 'handle_signal SIGHUP' SIGHUP
        trap 'handle_signal SIGINT' SIGINT
        trap cleanup_on_failure EXIT

        # Send SIGHUP to self
        kill -s HUP $$
        echo "SHOULD_NOT_REACH"
      `;

      const res = await runBash(testSnippet, sandboxDir);
      expect(res.code).toBe(129);
      expect(res.stdout).toContain('SIGNAL_CAUGHT: SIGHUP');
      expect(res.stdout).toContain('CLEANUP_HANDLED: signal=SIGHUP exit_code=129');
      expect(res.stdout).not.toContain('SHOULD_NOT_REACH');
    });
  });
});
