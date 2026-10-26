import * as fs from 'fs';
import * as path from 'path';

export function isStagingEnvironment(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.APP_ENV === 'staging' ||
    env.DEPLOY_ENV === 'staging' ||
    env.STAGING === 'true'
  );
}

const FORBIDDEN_STATIC_DB_NAMES = new Set([
  'cmd_office',
  'cmd_office_prod',
  'database_name',
  'postgres',
  'template1',
]);

/**
 * Checks whether a database name is a known production database or production variant.
 * Strictly rejects:
 * - Direct matches: cmd_office, cmd_office_prod, database_name, postgres, template1
 * - Production names with suffixes: cmd_office_staging, cmd_office_stage, cmd_office_test, etc.
 */
export function isForbiddenProductionDbName(dbName: string): boolean {
  const lower = (dbName || '').trim().toLowerCase();
  if (!lower) {
    return true;
  }
  if (FORBIDDEN_STATIC_DB_NAMES.has(lower)) {
    return true;
  }
  // Reject any database starting with cmd_office (e.g. cmd_office_staging, cmd_office_prod)
  if (lower.startsWith('cmd_office_') || lower.startsWith('cmd_office-')) {
    return true;
  }
  return false;
}

/**
 * Redacts database connection strings to prevent credential or token leakage.
 * Completely strips username, password, and query parameters.
 */
export function redactDatabaseUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return '[EMPTY_OR_UNDEFINED]';
  }
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname || 'unknown-host';
    const port = parsed.port ? `:${parsed.port}` : '';
    const db = (parsed.pathname || '').replace(/^\//, '').split('?')[0];
    return `${parsed.protocol}//[REDACTED]@${host}${port}/${db}`;
  } catch {
    return '[MALFORMED_URL]';
  }
}

export interface ProductionDbIdentity {
  hostname: string;
  port: number;
  dbName: string;
}

/**
 * Resolves trusted production database identity from on-disk production environment file
 * or explicit environment variables, without exposing credentials.
 */
export function getTrustedProductionDbIdentity(
  env: NodeJS.ProcessEnv = process.env,
  customProdEnvPath?: string,
): ProductionDbIdentity | null {
  let rawProdUrl = env.PRODUCTION_DATABASE_URL || env.PROD_DATABASE_URL;

  if (!rawProdUrl) {
    const defaultSearchPaths = customProdEnvPath
      ? [customProdEnvPath]
      : [
          path.resolve(process.cwd(), 'backend', '.env'),
          path.resolve(process.cwd(), '.env'),
        ];

    for (const searchPath of defaultSearchPaths) {
      try {
        if (fs.existsSync(searchPath)) {
          const content = fs.readFileSync(searchPath, 'utf8');
          const lines = content.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('DATABASE_URL=')) {
              let val = trimmed.substring('DATABASE_URL='.length).trim();
              if (
                (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
                (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
              ) {
                val = val.substring(1, val.length - 1);
              }
              if (val) {
                rawProdUrl = val;
                break;
              }
            }
          }
        }
      } catch {
        // Read failure - continue safely without throwing
      }
      if (rawProdUrl) {
        break;
      }
    }
  }

  if (!rawProdUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawProdUrl.trim());
    const hostname = (parsed.hostname || '').toLowerCase().trim();
    const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
    const dbName = (parsed.pathname || '').replace(/^\//, '').split('?')[0].trim().toLowerCase();
    if (hostname && dbName) {
      return { hostname, port, dbName };
    }
  } catch {
    // Malformed production URL in file - cannot establish identity
  }
  return null;
}

export interface ValidationOptions {
  trustedProdIdentity?: ProductionDbIdentity | null;
  customProdEnvPath?: string;
}

/**
 * Validates that staging database configuration is explicit and completely isolated from production.
 * Throws a fatal Error if:
 * 1. Staging indicator is present but DATABASE_URL is missing or blank.
 * 2. DATABASE_URL cannot be parsed as a PostgreSQL URL.
 * 3. DATABASE_URL has invalid protocol, missing hostname, bind-all host (0.0.0.0), or out-of-range port.
 * 4. DATABASE_URL points to known production database names (including cmd_office variants).
 * 5. DATABASE_URL database name does not contain an affirmative staging identifier (e.g. staging, stage, test).
 * 6. Staging target matches the trusted production database identity.
 */
export function assertSafeStagingDatabaseUrl(
  databaseUrl?: string,
  env: NodeJS.ProcessEnv = process.env,
  options?: ValidationOptions,
): URL {
  if (!isStagingEnvironment(env)) {
    if (!databaseUrl || !databaseUrl.trim()) {
      throw new Error('[DATABASE CONFIGURATION ERROR] DATABASE_URL is required but was not provided.');
    }
    return new URL(databaseUrl.trim());
  }

  if (!databaseUrl || !databaseUrl.trim()) {
    throw new Error(
      '[CRITICAL STAGING DB ISOLATION FAILURE] Staging environment requires an explicit, dedicated DATABASE_URL. Missing or empty DATABASE_URL.'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl.trim());
  } catch {
    throw new Error(
      '[CRITICAL STAGING DB ISOLATION FAILURE] Failed to parse staging DATABASE_URL: Invalid URL format.'
    );
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(
      `[CRITICAL STAGING DB ISOLATION FAILURE] Invalid protocol "${parsed.protocol}". Expected "postgresql:" or "postgres:".`
    );
  }

  const hostname = (parsed.hostname || '').toLowerCase().trim();
  if (!hostname) {
    throw new Error(
      '[CRITICAL STAGING DB ISOLATION FAILURE] Malformed database URL: Missing hostname.'
    );
  }

  if (hostname === '0.0.0.0') {
    throw new Error(
      '[CRITICAL STAGING DB ISOLATION FAILURE] Invalid database host "0.0.0.0". Database target cannot be a bind-all address.'
    );
  }

  const portNumber = parsed.port ? parseInt(parsed.port, 10) : 5432;
  if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
    throw new Error(
      `[CRITICAL STAGING DB ISOLATION FAILURE] Invalid database port: "${parsed.port}". Port must be between 1 and 65535.`
    );
  }

  const dbName = (parsed.pathname || '').replace(/^\//, '').split('?')[0].trim();
  if (!dbName) {
    throw new Error(
      '[CRITICAL STAGING DB ISOLATION FAILURE] Database name is missing from URL path. Refusing to connect.'
    );
  }

  // 1. Reject known production databases and production variants
  if (isForbiddenProductionDbName(dbName)) {
    throw new Error(
      `[CRITICAL STAGING DB ISOLATION FAILURE] Staging process cannot connect to production or default database "${dbName}". Known production databases (including cmd_office and its variants) are strictly forbidden.`
    );
  }

  // 2. A staging-looking database name alone is NOT proof of isolation, but must contain affirmative keyword
  const lowerDbName = dbName.toLowerCase();
  if (
    !lowerDbName.includes('staging') &&
    !lowerDbName.includes('stage') &&
    !lowerDbName.includes('test')
  ) {
    throw new Error(
      `[CRITICAL STAGING DB ISOLATION FAILURE] Unsafe staging database target "${dbName}". Staging database name must explicitly contain "staging", "stage", or "test" (e.g., "cmd_staging").`
    );
  }

  // 3. Where a trusted production database identity is available, compare against it
  const trustedProd =
    options?.trustedProdIdentity !== undefined
      ? options.trustedProdIdentity
      : getTrustedProductionDbIdentity(env, options?.customProdEnvPath);

  if (trustedProd) {
    if (
      hostname === trustedProd.hostname &&
      portNumber === trustedProd.port &&
      lowerDbName === trustedProd.dbName.toLowerCase()
    ) {
      throw new Error(
        `[CRITICAL STAGING DB ISOLATION FAILURE] Staging database target matches the production database identity on host "${hostname}". Refusing to connect to production database.`
      );
    }
  }

  return parsed;
}

export function getStagingPrismaClientOptions(env: NodeJS.ProcessEnv = process.env): any {
  if (isStagingEnvironment(env)) {
    const validatedUrl = assertSafeStagingDatabaseUrl(env.DATABASE_URL, env).toString();
    return {
      datasources: {
        db: {
          url: validatedUrl,
        },
      },
    };
  }
  return undefined;
}
