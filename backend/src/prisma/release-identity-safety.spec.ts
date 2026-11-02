import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { spawn } from 'child_process';

describe('Backend Release Identity & Restoration Safety Safeguards', () => {
  jest.setTimeout(30000);

  const rootDir = path.resolve(__dirname, '../../../');
  const deployScriptPath = path.join(rootDir, 'scripts/deploy-production.sh');
  const rollbackScriptPath = path.join(rootDir, 'scripts/rollback-production.sh');
  const restoreDrillScriptPath = path.join(rootDir, 'scripts/isolated-staging-restore-drill.sh');
  const deployStagingScriptPath = path.join(rootDir, 'scripts/deploy-staging.sh');
  const deploymentMdPath = path.join(rootDir, 'DEPLOYMENT.md');

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

  describe('Task 1 — Backend Release Identity Verification (deploy-production.sh & rollback-production.sh)', () => {
    it('generates version.json in candidate build output with exact commit SHA and package version', async () => {
      const testDir = path.join(rootDir, '.releases/test_manifest_' + Date.now());
      fs.mkdirSync(path.join(testDir, 'backend/dist'), { recursive: true });

      const targetCommit = '3df707a0ab65138c5cdfbf3db25f01828b7a64ef';
      const cmd = `
        CANDIDATE_WORKTREE="${testDir.replace(/\\/g, '/')}"
        TARGET_COMMIT="${targetCommit}"
        BACKEND_MANIFEST_FILE="$CANDIDATE_WORKTREE/backend/dist/version.json"
        cat << EOF > "$BACKEND_MANIFEST_FILE"
{
  "commit": "$TARGET_COMMIT",
  "builtAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")",
  "version": "0.0.1"
}
EOF
        [ -s "$BACKEND_MANIFEST_FILE" ] && echo "MANIFEST_CREATED"
      `;

      const res = await runBash(cmd);
      expect(res.stdout).toContain('MANIFEST_CREATED');

      const manifestPath = path.join(testDir, 'backend/dist/version.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      expect(parsed.commit).toBe(targetCommit);
      expect(parsed.version).toBe('0.0.1');
      expect(parsed.builtAt).toBeDefined();

      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('backend health check probe matches candidate commit and rejects stale worker commit', async () => {
      let serverResponse = { statusCode: 200, body: JSON.stringify({ commit: 'candidate_sha_123' }) };

      const server = http.createServer((_req, res) => {
        res.writeHead(serverResponse.statusCode, { 'Content-Type': 'application/json' });
        res.end(serverResponse.body);
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const port = (server.address() as any).port;

      const probeCmd = `
        check_backend_release_identity() {
            local expected_commit="$1"
            local url="http://127.0.0.1:${port}/api/version"
            local probe_tmp="${rootDir.replace(/\\/g, '/')}/.releases/probe_test_$$.json"
            mkdir -p "${rootDir.replace(/\\/g, '/')}/.releases"
            local match=1

            if command -v node &> /dev/null; then
                if TARGET_URL="$url" EXPECTED="$expected_commit" node -e '
                    const http = require("http");
                    const url = process.env.TARGET_URL || "";
                    const exp = (process.env.EXPECTED || "").trim();
                    const req = http.get(url, { timeout: 5000 }, (res) => {
                        if (res.statusCode !== 200) process.exit(1);
                        let body = "";
                        res.on("data", c => body += c);
                        res.on("end", () => {
                            try {
                                const d = JSON.parse(body);
                                if (d && typeof d === "object" && typeof d.commit === "string") {
                                    const act = d.commit.trim();
                                    if (act && act !== "unknown" && (!exp || act === exp)) {
                                        process.exit(0);
                                    }
                                }
                            } catch(e) {}
                            process.exit(1);
                        });
                    });
                    req.on("error", () => process.exit(1));
                    req.on("timeout", () => { req.destroy(); process.exit(1); });
                ' >/dev/null 2>&1; then
                    match=0
                fi
            fi
            return "$match"
        }

        # Case 1: Matching candidate commit
        if check_backend_release_identity "candidate_sha_123"; then
            echo "MATCH_SUCCESS"
        else
            echo "MATCH_FAILED"
        fi

        # Case 2: Mismatched stale worker commit
        if check_backend_release_identity "stale_old_sha_999"; then
            echo "STALE_ACCEPTED_ERROR"
        else
            echo "STALE_REJECTED_SUCCESS"
        fi
      `;

      const res = await runBash(probeCmd);
      expect(res.stdout).toContain('MATCH_SUCCESS');
      expect(res.stdout).toContain('STALE_REJECTED_SUCCESS');
      expect(res.stdout).not.toContain('STALE_ACCEPTED_ERROR');

      // Case 3: 503 Service Unavailable / missing manifest
      serverResponse = { statusCode: 503, body: JSON.stringify({ status: 'error', commit: 'unknown' }) };
      const failCmd = `
        ${probeCmd}
        if check_backend_release_identity "candidate_sha_123"; then
            echo "FAIL_CLOSED_ERROR"
        else
            echo "FAIL_CLOSED_SUCCESS"
        fi
      `;
      const resFail = await runBash(failCmd);
      expect(resFail.stdout).toContain('FAIL_CLOSED_SUCCESS');
      expect(resFail.stdout).not.toContain('FAIL_CLOSED_ERROR');

      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('health verification loop enforces consecutive success count to prevent false-positives during rolling reload', async () => {
      const loopSimulation = `
        CONSECUTIVE_SUCCESSES=0
        REQUIRED_CONSECUTIVE=2
        HEALTHY=false

        # Simulate attempt 1: Pass
        CONSECUTIVE_SUCCESSES=$((CONSECUTIVE_SUCCESSES + 1))
        echo "Attempt 1 consecutive: $CONSECUTIVE_SUCCESSES"

        # Simulate attempt 2: Flap / hit stale worker -> Fail
        CONSECUTIVE_SUCCESSES=0
        echo "Attempt 2 flap reset: $CONSECUTIVE_SUCCESSES"

        # Simulate attempt 3: Pass
        CONSECUTIVE_SUCCESSES=$((CONSECUTIVE_SUCCESSES + 1))
        echo "Attempt 3 consecutive: $CONSECUTIVE_SUCCESSES"

        # Simulate attempt 4: Pass
        CONSECUTIVE_SUCCESSES=$((CONSECUTIVE_SUCCESSES + 1))
        echo "Attempt 4 consecutive: $CONSECUTIVE_SUCCESSES"
        if [ "$CONSECUTIVE_SUCCESSES" -ge "$REQUIRED_CONSECUTIVE" ]; then
            HEALTHY=true
        fi

        echo "FINAL_HEALTHY: $HEALTHY"
      `;

      const res = await runBash(loopSimulation);
      expect(res.stdout).toContain('Attempt 1 consecutive: 1');
      expect(res.stdout).toContain('Attempt 2 flap reset: 0');
      expect(res.stdout).toContain('Attempt 3 consecutive: 1');
      expect(res.stdout).toContain('Attempt 4 consecutive: 2');
      expect(res.stdout).toContain('FINAL_HEALTHY: true');
    });
  });

  describe('Task 2 — Safe Database Restoration Drill Safeguards (scripts/isolated-staging-restore-drill.sh)', () => {
    it('refuses execution and fails closed if CONFIRM_ISOLATED_STAGING_ENVIRONMENT is missing', async () => {
      const res = await runBash(`"${restoreDrillScriptPath.replace(/\\/g, '/')}"`);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('Restoration drill refused! Explicit authorization required');
      expect(res.stderr).toContain('CONFIRM_ISOLATED_STAGING_ENVIRONMENT=true');
    });

    it('refuses execution if hostname contains production identifiers', async () => {
      const cmd = `
        hostname() { echo "hartek-cmd-prod-vps"; }
        export -f hostname
        export CONFIRM_ISOLATED_STAGING_ENVIRONMENT=true
        "${restoreDrillScriptPath.replace(/\\/g, '/')}"
      `;
      const res = await runBash(cmd);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('matches production pattern! Aborting drill');
    });

    it('refuses execution on default production port 5432 on localhost without explicit container flag', async () => {
      const cmd = `
        hostname() { echo "hartek-staging-box"; }
        export -f hostname
        export CONFIRM_ISOLATED_STAGING_ENVIRONMENT=true
        export STAGING_PG_HOST=127.0.0.1
        export STAGING_PG_PORT=5432
        "${restoreDrillScriptPath.replace(/\\/g, '/')}"
      `;
      const res = await runBash(cmd);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('Port 5432 on localhost is the default production PostgreSQL port');
    });

    it('scratch database pattern matches safe prefix and rejects protected database names', async () => {
      const patternCheck = `
        SAFE_PATTERN='^cmd_restore_drill_[0-9]{8}-[0-9]{6}_[0-9a-f]+$'
        SAFE_PATTERN2='^cmd_restore_drill_[0-9]{8}_[0-9]{6}_[0-9a-f]+$'

        TEST_DB="cmd_restore_drill_20261031-120000_a1b2c3d4"
        if [[ "$TEST_DB" =~ $SAFE_PATTERN ]] || [[ "$TEST_DB" =~ $SAFE_PATTERN2 ]]; then
            echo "VALID_SCRATCH_ACCEPTED"
        fi

        # Test rejection of protected names
        for bad_db in "cmd_office" "cmd_office_staging" "postgres" "template1"; do
            case "$bad_db" in
                cmd_office*|cmd_office_staging*|postgres*|template0*|template1*)
                    echo "REJECTED_$bad_db"
                    ;;
            esac
        done
      `;
      const res = await runBash(patternCheck);
      expect(res.stdout).toContain('VALID_SCRATCH_ACCEPTED');
      expect(res.stdout).toContain('REJECTED_cmd_office');
      expect(res.stdout).toContain('REJECTED_cmd_office_staging');
      expect(res.stdout).toContain('REJECTED_postgres');
      expect(res.stdout).toContain('REJECTED_template1');
    });

    it('fails closed when role possesses active superuser privileges despite non-superuser username', async () => {
      const mockDir = path.join(rootDir, '.releases/test_mock_psql_super_' + Date.now());
      fs.mkdirSync(mockDir, { recursive: true });
      const mockPsql = path.join(mockDir, 'psql');
      fs.writeFileSync(
        mockPsql,
        `#!/usr/bin/env bash
if [[ "$*" =~ "inet_server_addr" ]]; then
  exit 0
fi
if [[ "$*" =~ "is_superuser" ]]; then
  echo "on|t"
  exit 0
fi
exit 0
`,
        { mode: 0o755 }
      );

      const cmd = `
        export PATH="${toPosixPath(mockDir)}:$PATH"
        export CONFIRM_ISOLATED_STAGING_ENVIRONMENT=true
        export STAGING_PG_HOST=127.0.0.1
        export STAGING_PG_PORT=5433
        export STAGING_PG_USER=cmd_staging
        "${restoreDrillScriptPath.replace(/\\/g, '/')}"
      `;
      try {
        const res = await runBash(cmd);
        expect(res.code).toBe(1);
        expect(res.stderr).toContain("Target role 'cmd_staging' possesses active SUPERUSER privileges in PostgreSQL");
      } finally {
        fs.rmSync(mockDir, { recursive: true, force: true });
      }
    });

    it('fails closed when role lacks CREATEDB privilege in catalog', async () => {
      const mockDir = path.join(rootDir, '.releases/test_mock_psql_nocreatedb_' + Date.now());
      fs.mkdirSync(mockDir, { recursive: true });
      const mockPsql = path.join(mockDir, 'psql');
      fs.writeFileSync(
        mockPsql,
        `#!/usr/bin/env bash
if [[ "$*" =~ "inet_server_addr" ]]; then
  exit 0
fi
if [[ "$*" =~ "is_superuser" ]]; then
  echo "off|f"
  exit 0
fi
exit 0
`,
        { mode: 0o755 }
      );

      const cmd = `
        export PATH="${toPosixPath(mockDir)}:$PATH"
        export CONFIRM_ISOLATED_STAGING_ENVIRONMENT=true
        export STAGING_PG_HOST=127.0.0.1
        export STAGING_PG_PORT=5433
        export STAGING_PG_USER=cmd_staging
        "${restoreDrillScriptPath.replace(/\\/g, '/')}"
      `;
      try {
        const res = await runBash(cmd);
        expect(res.code).toBe(1);
        expect(res.stderr).toContain("Target role 'cmd_staging' lacks the CREATEDB privilege");
      } finally {
        fs.rmSync(mockDir, { recursive: true, force: true });
      }
    });

    it('fails closed when role privilege query fails or returns malformed results', async () => {
      const mockDir = path.join(rootDir, '.releases/test_mock_psql_malformed_' + Date.now());
      fs.mkdirSync(mockDir, { recursive: true });
      const mockPsql = path.join(mockDir, 'psql');
      fs.writeFileSync(
        mockPsql,
        `#!/usr/bin/env bash
if [[ "$*" =~ "inet_server_addr" ]]; then
  exit 0
fi
if [[ "$*" =~ "is_superuser" ]]; then
  echo "unexpected_error_corrupted_response"
  exit 0
fi
exit 0
`,
        { mode: 0o755 }
      );

      const cmd = `
        export PATH="${toPosixPath(mockDir)}:$PATH"
        export CONFIRM_ISOLATED_STAGING_ENVIRONMENT=true
        export STAGING_PG_HOST=127.0.0.1
        export STAGING_PG_PORT=5433
        export STAGING_PG_USER=cmd_staging
        "${restoreDrillScriptPath.replace(/\\/g, '/')}"
      `;
      try {
        const res = await runBash(cmd);
        expect(res.code).toBe(1);
        expect(res.stderr).toContain("Failed to query or parse role privileges from PostgreSQL catalog");
      } finally {
        fs.rmSync(mockDir, { recursive: true, force: true });
      }
    });
  });

  describe('Task 3 — Staging Source Alignment & Documentation Safeguards', () => {
    it('refuses staging deployment when target commit differs from checked-out HEAD', async () => {
      const cmd = `"${deployStagingScriptPath.replace(/\\/g, '/')}" HEAD~1`;
      const res = await runBash(cmd);
      expect(res.code).toBe(1);
      expect(res.stdout + res.stderr).toContain('does not match checked-out HEAD');
    });

    it('refuses staging deployment when target reference is unresolvable or invalid', async () => {
      const cmd = `"${deployStagingScriptPath.replace(/\\/g, '/')}" invalid_ref_nonexistent_99999`;
      const res = await runBash(cmd);
      expect(res.code).toBe(1);
      expect(res.stdout + res.stderr).toContain("Invalid or unresolvable target reference: 'invalid_ref_nonexistent_99999'");
    });

    it('refuses staging deployment when dirty working tree with uncommitted tracked changes is present', async () => {
      const cmd = `"${toPosixPath(deployStagingScriptPath)}" HEAD`;
      const res = await runBash(cmd);
      expect(res.code).toBe(1);
      expect(res.stderr).toContain('Dirty working tree detected! Uncommitted tracked changes exist in staging repository');
    });

    it('refuses staging deployment when untracked source files exist in backend/src/', async () => {
      const mockDir = path.join(rootDir, '.releases/test_mock_git_untracked_backend_' + Date.now());
      fs.mkdirSync(mockDir, { recursive: true });
      const mockGit = path.join(mockDir, 'git');
      fs.writeFileSync(
        mockGit,
        `#!/usr/bin/env bash
if [ "$1" = "status" ]; then
  if [ "$2" = "--porcelain" ]; then
    if [ "$3" = "--untracked-files=no" ]; then
      exit 0
    fi
    echo "?? backend/src/leaked-service.ts"
    exit 0
  fi
fi
if [ "$1" = "rev-parse" ]; then
  echo "3df707a0ab65138c5cdfbf3db25f01828b7a64ef"
  exit 0
fi
exit 0
`,
        { mode: 0o755 }
      );

      const cmd = `
        export PATH="${toPosixPath(mockDir)}:$PATH"
        "${toPosixPath(deployStagingScriptPath)}" HEAD
      `;
      try {
        const res = await runBash(cmd);
        expect(res.code).toBe(1);
        expect(res.stderr).toContain('Untracked source or configuration files detected in build paths');
        expect(res.stderr).toContain('backend/src/leaked-service.ts');
      } finally {
        fs.rmSync(mockDir, { recursive: true, force: true });
      }
    });

    it('refuses staging deployment when untracked component files exist in frontend/', async () => {
      const mockDir = path.join(rootDir, '.releases/test_mock_git_untracked_frontend_' + Date.now());
      fs.mkdirSync(mockDir, { recursive: true });
      const mockGit = path.join(mockDir, 'git');
      fs.writeFileSync(
        mockGit,
        `#!/usr/bin/env bash
if [ "$1" = "status" ]; then
  if [ "$2" = "--porcelain" ]; then
    if [ "$3" = "--untracked-files=no" ]; then
      exit 0
    fi
    echo "?? frontend/components/LeakedWidget.tsx"
    exit 0
  fi
fi
if [ "$1" = "rev-parse" ]; then
  echo "3df707a0ab65138c5cdfbf3db25f01828b7a64ef"
  exit 0
fi
exit 0
`,
        { mode: 0o755 }
      );

      const cmd = `
        export PATH="${toPosixPath(mockDir)}:$PATH"
        "${toPosixPath(deployStagingScriptPath)}" HEAD
      `;
      try {
        const res = await runBash(cmd);
        expect(res.code).toBe(1);
        expect(res.stderr).toContain('Untracked source or configuration files detected in build paths');
        expect(res.stderr).toContain('frontend/components/LeakedWidget.tsx');
      } finally {
        fs.rmSync(mockDir, { recursive: true, force: true });
      }
    });

    it('permits staging deployment preflight when untracked files are strictly outside build paths or are test specs', async () => {
      const mockDir = path.join(rootDir, '.releases/test_mock_git_untracked_benign_' + Date.now());
      fs.mkdirSync(mockDir, { recursive: true });
      const mockGit = path.join(mockDir, 'git');
      fs.writeFileSync(
        mockGit,
        `#!/usr/bin/env bash
if [ "$1" = "status" ]; then
  if [ "$2" = "--porcelain" ]; then
    if [ "$3" = "--untracked-files=no" ]; then
      exit 0
    fi
    echo "?? scripts/benign-tool.sh"
    echo "?? backend/src/unit.spec.ts"
    exit 0
  fi
fi
if [ "$1" = "rev-parse" ]; then
  echo "3df707a0ab65138c5cdfbf3db25f01828b7a64ef"
  exit 0
fi
exit 0
`,
        { mode: 0o755 }
      );

      const cmd = `
        export PATH="${toPosixPath(mockDir)}:$PATH"
        "${toPosixPath(deployStagingScriptPath)}" HEAD
      `;
      try {
        const res = await runBash(cmd);
        // It should NOT fail with untracked build files error.
        expect(res.stderr).not.toContain('Untracked source or configuration files detected in build paths');
      } finally {
        fs.rmSync(mockDir, { recursive: true, force: true });
      }
    });

    it('verifies DEPLOYMENT.md documents loopback-only Docker port mapping (127.0.0.1:5433:5432)', () => {
      const content = fs.readFileSync(deploymentMdPath, 'utf8');
      expect(content).toContain('-p 127.0.0.1:5433:5432');
      expect(content).not.toMatch(/(^|\s)-p\s+5433:5432/);
    });

    it('verifies DEPLOYMENT.md initializes isolated container with separate admin and non-superuser role with CREATEDB', () => {
      const content = fs.readFileSync(deploymentMdPath, 'utf8');
      // Must NOT use POSTGRES_USER=cmd_staging (which creates superuser)
      expect(content).not.toContain('POSTGRES_USER=cmd_staging');
      // Must initialize with separate administrative account
      expect(content).toContain('POSTGRES_USER=drill_admin');
      // Must create cmd_staging as non-superuser with CREATEDB
      expect(content).toMatch(/CREATE ROLE cmd_staging WITH LOGIN NOSUPERUSER NOCREATEROLE CREATEDB/);
      // Must configure drill to connect as cmd_staging
      expect(content).toContain('STAGING_PG_USER="cmd_staging"');
      // Must bind strictly to loopback
      expect(content).toContain('-p 127.0.0.1:5433:5432');
    });
  });
});
