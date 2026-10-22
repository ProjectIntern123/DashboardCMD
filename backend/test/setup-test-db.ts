import * as fs from 'fs';
import * as path from 'path';

export const APPROVED_TEST_DATABASE_NAME = 'cmd_office_test';
export const APPROVED_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Asserts that a given database connection URL strictly points to the approved local test database.
 * Fails closed immediately on:
 * - Missing or empty URLs
 * - Malformed URLs
 * - Non-Postgres protocols
 * - Non-loopback hosts (e.g. remote hosts, production IPs, cloud domains)
 * - Any database name other than 'cmd_office_test' (e.g. cmd_office_prod, cmd_office, postgres)
 */
export function assertSafeTestDatabaseUrl(rawUrl: string | undefined | null): URL {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error(
      '[CRITICAL TEST DB ISOLATION FAILURE] Database URL is missing or empty. Refusing to run tests without explicit configuration.'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (err: any) {
    throw new Error(
      `[CRITICAL TEST DB ISOLATION FAILURE] Malformed database URL: "${rawUrl}". Reason: ${err?.message || 'Invalid URL'}`
    );
  }

  // 1. Verify protocol
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(
      `[CRITICAL TEST DB ISOLATION FAILURE] Invalid protocol "${parsed.protocol}". Expected "postgresql:" or "postgres:".`
    );
  }

  // 2. Verify hostname presence and loopback host
  const hostname = (parsed.hostname || '').toLowerCase().trim();
  if (!hostname) {
    throw new Error(
      `[CRITICAL TEST DB ISOLATION FAILURE] Malformed database URL: "${rawUrl}". Missing hostname.`
    );
  }

  if (!APPROVED_LOOPBACK_HOSTS.has(hostname)) {
    throw new Error(
      `[CRITICAL TEST DB ISOLATION FAILURE] Unsafe database host "${hostname}". Test execution is strictly restricted to loopback hosts (${Array.from(APPROVED_LOOPBACK_HOSTS).join(', ')}). Remote hosts and non-loopback IPs are forbidden.`
    );
  }

  // 3. Extract and verify database name
  const dbName = (parsed.pathname || '').replace(/^\//, '').split('?')[0].trim();
  if (!dbName) {
    throw new Error(
      '[CRITICAL TEST DB ISOLATION FAILURE] Database name is missing from URL path. Refusing to connect.'
    );
  }

  if (dbName !== APPROVED_TEST_DATABASE_NAME) {
    throw new Error(
      `[CRITICAL TEST DB ISOLATION FAILURE] Unauthorized database target "${dbName}". Tests may ONLY target the approved test database "${APPROVED_TEST_DATABASE_NAME}". Production, default, or unexpected database names (e.g. "cmd_office", "cmd_office_prod") are strictly rejected.`
    );
  }

  return parsed;
}

/**
 * Resolves the candidate test database URL and guarantees isolation before any test runs.
 * Supports:
 * - Direct TEST_DATABASE_URL
 * - Already-configured DATABASE_URL (when not testing custom envPath)
 * - Controlled derivation from verified local dev database (localhost:cmd_office)
 */
export function configureTestEnvironment(options?: {
  envPath?: string;
  explicitUrl?: string;
}): string {
  let targetUrl = options?.explicitUrl || process.env.TEST_DATABASE_URL;

  // Only reuse already-configured DATABASE_URL if no custom envPath is requested
  if (!targetUrl && !options?.envPath && process.env.DATABASE_URL) {
    try {
      const parsed = new URL(process.env.DATABASE_URL);
      const dbName = parsed.pathname.replace(/^\//, '').split('?')[0];
      if (dbName === APPROVED_TEST_DATABASE_NAME) {
        targetUrl = process.env.DATABASE_URL;
      }
    } catch (e) {
      // Ignored here; will fail assertion downstream if invalid
    }
  }

  if (!targetUrl) {
    const defaultEnvPath = options?.envPath || path.resolve(__dirname, '../.env');
    if (fs.existsSync(defaultEnvPath)) {
      const envContent = fs.readFileSync(defaultEnvPath, 'utf8');
      const testMatch = envContent.match(/TEST_DATABASE_URL=['"]?(.*?)['"]?(\r?\n|$)/);
      if (testMatch && testMatch[1].trim()) {
        targetUrl = testMatch[1].trim();
      } else {
        const match = envContent.match(/DATABASE_URL=['"]?(.*?)['"]?(\r?\n|$)/);
        if (match && match[1].trim()) {
          const rawEnvUrl = match[1].trim();
          try {
            const parsedEnv = new URL(rawEnvUrl);
            const envHost = (parsedEnv.hostname || '').toLowerCase().trim();
            const envDb = (parsedEnv.pathname || '').replace(/^\//, '').split('?')[0].trim();

            // ONLY allow automatic test derivation if the .env target is strictly localhost/127.0.0.1 AND db is 'cmd_office'
            if (APPROVED_LOOPBACK_HOSTS.has(envHost) && envDb === 'cmd_office') {
              parsedEnv.pathname = `/${APPROVED_TEST_DATABASE_NAME}`;
              targetUrl = parsedEnv.toString();
            } else {
              throw new Error(
                `[CRITICAL TEST DB ISOLATION FAILURE] Cannot safely derive test database from environment: host "${envHost}" and db "${envDb}" do not match the expected local development baseline (localhost / cmd_office).`
              );
            }
          } catch (err: any) {
            throw new Error(
              `[CRITICAL TEST DB ISOLATION FAILURE] Failed to safely parse environment DATABASE_URL: ${err?.message}`
            );
          }
        }
      }
    }
  }

  // Final assertion: must pass all strict safety rules
  assertSafeTestDatabaseUrl(targetUrl);

  process.env.DATABASE_URL = targetUrl!;
  const redacted = targetUrl!.replace(/:\/\/.*@/, '://[REDACTED]@');
  console.log(`[JEST SETUP] Isolated test database verified and active: ${redacted}`);
  return targetUrl!;
}

// Automatically configure when loaded via Jest setupFiles (unless in standalone unit test mode)
if (process.env.NODE_ENV !== 'test-unit-manual') {
  try {
    configureTestEnvironment();
  } catch (err: any) {
    // Print clear diagnostic message and rethrow to abort Jest runner immediately
    console.error(err.message);
    throw err;
  }
}
