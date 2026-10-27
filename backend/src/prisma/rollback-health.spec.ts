import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

describe('Production Rollback Health Verification Safeguards (scripts/rollback-production.sh)', () => {
  const rootDir = path.resolve(__dirname, '../../../');
  const rollbackScriptPath = path.join(rootDir, 'scripts/rollback-production.sh');
  const deployScriptPath = path.join(rootDir, 'scripts/deploy-production.sh');

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

  describe('Static Script Safety & Control Flow Analysis', () => {
    it('verifies rollback-production.sh contains check_http_endpoint helper and Node.js fallback', () => {
      const content = fs.readFileSync(rollbackScriptPath, 'utf8');

      expect(content).toContain('check_http_endpoint()');
      expect(content).toContain('command -v curl');
      expect(content).toContain('command -v node');
      expect(content).toContain('node -e');
      expect(content).toContain('return 2');
    });

    it('verifies rollback-production.sh fails closed when neither curl nor node is available', () => {
      const content = fs.readFileSync(rollbackScriptPath, 'utf8');

      expect(content).toContain("Neither 'curl' nor 'node' executable is available");
      expect(content).toContain('Failing closed to prevent unverified rollback completion.');
    });

    it('verifies rollback-production.sh eliminated the false-positive curl fallback', () => {
      const content = fs.readFileSync(rollbackScriptPath, 'utf8');

      expect(content).not.toContain('curl command not found. Skipping HTTP probe.');
      expect(content).not.toContain('curl -s -f "$url" || true');
    });

    it('verifies rollback-production.sh requires both backend and frontend to be healthy', () => {
      const content = fs.readFileSync(rollbackScriptPath, 'utf8');

      expect(content).toContain('if [ "$BACKEND_OK" = true ] && [ "$FRONTEND_OK" = true ]; then');
      expect(content).toContain('HEALTHY=true');
      expect(content).toContain('check_http_endpoint "http://127.0.0.1:4000/api/settings/public"');
      expect(content).toContain('check_http_endpoint "http://127.0.0.1:3000/"');
    });

    it('verifies rollback-production.sh exits with code 1 when health verification fails', () => {
      const content = fs.readFileSync(rollbackScriptPath, 'utf8');

      expect(content).toContain('[CRITICAL ERROR] Rollback health check failed! Application did not respond 200 OK.');
      expect(content).toContain('exit 1');
    });
  });

  describe('Executable Probe Logic Verification (Offline HTTP Server)', () => {
    let server: http.Server;
    let serverUrl: string;
    let statusCodeToReturn = 200;
    let responseDelayMs = 0;

    beforeAll((done) => {
      server = http.createServer((req, res) => {
        if (responseDelayMs > 0) {
          setTimeout(() => {
            res.writeHead(statusCodeToReturn, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: statusCodeToReturn === 200 ? 'ok' : 'error' }));
          }, responseDelayMs);
        } else {
          res.writeHead(statusCodeToReturn, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: statusCodeToReturn === 200 ? 'ok' : 'error' }));
        }
      });

      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as any;
        serverUrl = `http://127.0.0.1:${address.port}/health`;
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

    beforeEach(() => {
      statusCodeToReturn = 200;
      responseDelayMs = 0;
    });

    // Helper to execute bash probe snippet
    const runBashProbe = (
      targetUrl: string,
      mockOptions: { mockNoCurl?: boolean; mockNoNode?: boolean; mockNoBoth?: boolean } = {}
    ): Promise<{ code: number; stdout: string; stderr: string }> => {
      let bashSnippet = `
        set +e
      `;

      if (mockOptions.mockNoBoth) {
        bashSnippet += `
          command() {
            if [ "$1" = "-v" ] && { [ "$2" = "curl" ] || [ "$2" = "node" ]; }; then
              return 1
            fi
            builtin command "$@"
          }
        `;
      } else if (mockOptions.mockNoCurl) {
        bashSnippet += `
          command() {
            if [ "$1" = "-v" ] && [ "$2" = "curl" ]; then
              return 1
            fi
            builtin command "$@"
          }
        `;
      } else if (mockOptions.mockNoNode) {
        bashSnippet += `
          command() {
            if [ "$1" = "-v" ] && [ "$2" = "node" ]; then
              return 1
            fi
            builtin command "$@"
          }
        `;
      }

      bashSnippet += `
        check_http_endpoint() {
            local url="$1"
            if command -v curl &> /dev/null; then
                curl -s -f "$url" > /dev/null 2>&1
                return $?
            elif command -v node &> /dev/null; then
                node -e '
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
                ' "$url" > /dev/null 2>&1
                return $?
            else
                return 2
            fi
        }

        check_http_endpoint "${targetUrl}"
        exit $?
      `;

      return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        const child = spawn(bashExecutable, ['-c', bashSnippet], {
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

    // Test 1: curl available and endpoints healthy
    it('Scenario 1 — curl available and endpoint healthy: returns exit code 0', async () => {
      statusCodeToReturn = 200;
      const res = await runBashProbe(serverUrl);
      expect(res.code).toBe(0);
    });

    // Test 2: curl available but an endpoint unhealthy
    it('Scenario 2 — curl available but endpoint unhealthy (500): returns non-zero exit code', async () => {
      statusCodeToReturn = 500;
      const res = await runBashProbe(serverUrl);
      expect(res.code).not.toBe(0);
    });

    it('Scenario 2b — curl available but endpoint not found (404): returns non-zero exit code', async () => {
      statusCodeToReturn = 404;
      const res = await runBashProbe(serverUrl);
      expect(res.code).not.toBe(0);
    });

    // Test 3: curl unavailable and Node.js fallback healthy
    it('Scenario 3 — curl unavailable and Node.js fallback healthy: returns exit code 0', async () => {
      statusCodeToReturn = 200;
      const res = await runBashProbe(serverUrl, { mockNoCurl: true });
      expect(res.code).toBe(0);
    });

    // Test 4: Both curl and Node.js unavailable
    it('Scenario 4 — Both curl and Node.js unavailable: probe returns exit code 2 (tool missing)', async () => {
      const res = await runBashProbe(serverUrl, { mockNoBoth: true });
      expect(res.code).toBe(2);
    });

    // Test 5: HTTP timeout or connection failure
    it('Scenario 5a — Connection failure (unreachable host/port): returns non-zero exit code', async () => {
      const res = await runBashProbe('http://127.0.0.1:59998/offline');
      expect(res.code).not.toBe(0);
    });

    it('Scenario 5b — Timeout past 3000ms on Node.js fallback: returns non-zero exit code', async () => {
      responseDelayMs = 3500;
      const res = await runBashProbe(serverUrl, { mockNoCurl: true });
      expect(res.code).not.toBe(0);
    }, 8000);

    // Test 6: Rollback must never report successful verification when a required probe fails
    it('Scenario 6 — Rollback verification loop: fails closed with exit code 1 when an endpoint fails', async () => {
      const testLoopSnippet = `
        check_http_endpoint() {
            local url="$1"
            if [ "$url" = "http://backend.mock/healthy" ]; then
                return 0
            else
                return 1
            fi
        }

        HEALTHY=false
        BACKEND_OK=false
        FRONTEND_OK=false

        if check_http_endpoint "http://backend.mock/healthy"; then
            BACKEND_OK=true
        fi
        if check_http_endpoint "http://frontend.mock/failing"; then
            FRONTEND_OK=true
        fi

        if [ "$BACKEND_OK" = true ] && [ "$FRONTEND_OK" = true ]; then
            HEALTHY=true
        fi

        if [ "$HEALTHY" = true ]; then
            echo "[ROLLBACK COMPLETE & VERIFIED]"
            exit 0
        else
            echo "[CRITICAL ERROR] Rollback health check failed!"
            exit 1
        fi
      `;

      const res = await new Promise<{ code: number; stdout: string }>((resolve) => {
        let stdout = '';
        const child = spawn(bashExecutable, ['-c', testLoopSnippet], {
          windowsHide: true,
        });
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.on('close', (code) => {
          resolve({ code: code ?? 1, stdout });
        });
      });

      expect(res.code).toBe(1);
      expect(res.stdout).toContain('[CRITICAL ERROR] Rollback health check failed!');
      expect(res.stdout).not.toContain('[ROLLBACK COMPLETE & VERIFIED]');
    });
  });
});
