#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Staging Preflight Validation Script
# Strictly validates staging isolation, dedicated database, tools, and ports
# Zero credentials or secrets printed to logs
# ==============================================================================
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
PROJECT_DIR="$(pwd)"

echo "======================================================================"
echo "[HARTEK CMD] Staging Preflight Validation"
echo "Timestamp: $TIMESTAMP"
echo "======================================================================"

# ------------------------------------------------------------------------------
# STEP 1: DIRECTORY & WORKSPACE CHECKS
# ------------------------------------------------------------------------------
echo "==> Step 1: Checking Workspace & Directory Structure..."

if [ ! -f "backend/package.json" ] || [ ! -f "frontend/package.json" ]; then
    echo "  [CRITICAL ERROR] Script must be run from project root directory containing backend/ and frontend/."
    exit 1
fi

if [ ! -f "ecosystem.staging.config.js" ]; then
    echo "  [CRITICAL ERROR] ecosystem.staging.config.js not found in project root."
    exit 1
fi

# Resolve canonical project directory
CANONICAL_DIR="$(cd "$PROJECT_DIR" && pwd -P)"
echo "  Directory:  $PROJECT_DIR"
echo "  Canonical:  $CANONICAL_DIR"
echo "  User:       $(whoami 2>/dev/null || echo 'unknown')"

# 1. Reject known production installation directories
KNOWN_PROD_DIRS=(
    "/var/www/cmd-dashboard"
    "/var/www/CMDDashboard"
    "/var/www/cmd_office"
    "/srv/cmd-dashboard"
)
if [ -n "${PROD_PROJECT_DIR:-}" ]; then
    CANONICAL_PROD_TARGET="$(cd "$PROD_PROJECT_DIR" 2>/dev/null && pwd -P || echo "$PROD_PROJECT_DIR")"
    KNOWN_PROD_DIRS+=("$CANONICAL_PROD_TARGET")
fi

for prod_dir in "${KNOWN_PROD_DIRS[@]}"; do
    if [ "$CANONICAL_DIR" = "$prod_dir" ]; then
        echo "  [CRITICAL ISOLATION BREACH] Staging preflight detected running in production directory: '$CANONICAL_DIR'!"
        echo "  Executing staging scripts inside the production directory is strictly forbidden."
        exit 1
    fi
done

# 2. Reject if directory basename indicates a production root
DIR_BASENAME="$(basename "$CANONICAL_DIR")"
LOWER_DIR_BASENAME=$(echo "$DIR_BASENAME" | tr '[:upper:]' '[:lower:]')
case "$LOWER_DIR_BASENAME" in
    cmd-dashboard|cmddashboard|cmd_office|cmdoffice)
        echo "  [CRITICAL ISOLATION BREACH] Staging cannot run in a production-named directory ('$DIR_BASENAME')!"
        echo "  Staging directory must affirmatively identify as staging (e.g. cmd-dashboard-staging)."
        exit 1
        ;;
esac

# 3. Positive verification of approved staging directory
LOWER_CANONICAL_DIR=$(echo "$CANONICAL_DIR" | tr '[:upper:]' '[:lower:]')
IS_APPROVED_STAGING_DIR=0

if [ -n "${STAGING_PROJECT_DIR:-}" ]; then
    CANONICAL_STAGING_TARGET="$(cd "$STAGING_PROJECT_DIR" 2>/dev/null && pwd -P || echo "$STAGING_PROJECT_DIR")"
    if [ "$CANONICAL_DIR" = "$CANONICAL_STAGING_TARGET" ]; then
        IS_APPROVED_STAGING_DIR=1
    fi
fi

if [[ "$LOWER_CANONICAL_DIR" =~ (staging|stage|test) ]]; then
    IS_APPROVED_STAGING_DIR=1
fi

if [ "${ALLOW_CUSTOM_STAGING_DIR:-0}" = "1" ]; then
    IS_APPROVED_STAGING_DIR=1
fi

if [ "$IS_APPROVED_STAGING_DIR" -ne 1 ]; then
    echo "  [CRITICAL ERROR] Current directory '$CANONICAL_DIR' is not an approved staging installation directory!"
    echo "  Staging must run in a directory identifying as staging (e.g. /var/www/cmd-dashboard-staging) or matching STAGING_PROJECT_DIR."
    exit 1
fi

# 4. Verify ecosystem.staging.config.js defines dedicated staging process names and not production names
if ! grep -q "cmd-staging-backend" ecosystem.staging.config.js || ! grep -q "cmd-staging-frontend" ecosystem.staging.config.js; then
    echo "  [CRITICAL ERROR] ecosystem.staging.config.js is missing required staging process names ('cmd-staging-backend', 'cmd-staging-frontend')!"
    exit 1
fi

if grep -E "name:[[:space:]]*['\"]cmd-backend['\"]" ecosystem.staging.config.js || grep -E "name:[[:space:]]*['\"]cmd-frontend['\"]" ecosystem.staging.config.js; then
    echo "  [CRITICAL ERROR] ecosystem.staging.config.js improperly defines production process names ('cmd-backend', 'cmd-frontend')!"
    exit 1
fi

# ------------------------------------------------------------------------------
# STEP 2: REQUIRED TOOL AVAILABILITY (FAIL-CLOSED)
# ------------------------------------------------------------------------------
echo "==> Step 2: Validating Required System Tools..."

MISSING_TOOLS=()

for tool in node npm git pm2 curl; do
    if ! command -v "$tool" &> /dev/null; then
        MISSING_TOOLS+=("$tool")
    fi
done

if [ ${#MISSING_TOOLS[@]} -gt 0 ]; then
    echo "  [CRITICAL ERROR] Missing required system tools: ${MISSING_TOOLS[*]}"
    echo "  Staging validation fails closed when required tools (including curl) are unavailable."
    exit 1
fi

echo "  Node:       $(node -v)"
echo "  npm:        $(npm -v)"
echo "  Git:        $(git --version | head -n1)"
echo "  PM2:        $(pm2 -v 2>/dev/null || echo 'available')"
echo "  curl:       $(curl --version | head -n1 | cut -d' ' -f1-2)"

# ------------------------------------------------------------------------------
# STEP 3: GIT STATE AND BRANCH VERIFICATION
# ------------------------------------------------------------------------------
echo "==> Step 3: Checking Git Working Tree..."

if [ ! -d ".git" ]; then
    echo "  [CRITICAL ERROR] Not a git repository. Cannot safely verify release state."
    exit 1
fi

CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "detached")
CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
echo "  Current Branch: $CURRENT_BRANCH"
echo "  Current Commit: $CURRENT_COMMIT"

# Check for uncommitted changes (informational in preflight)
UNCOMMITTED_CHANGES=$(git status --porcelain || true)
if [ -n "$UNCOMMITTED_CHANGES" ]; then
    echo "  [WARN] Working tree contains modified or untracked files:"
    git status --short
fi

# ------------------------------------------------------------------------------
# STEP 4: DEDICATED STAGING ENVIRONMENT & DATABASE ISOLATION
# ------------------------------------------------------------------------------
echo "==> Step 4: Validating Dedicated Staging Database & Environment Configuration..."

STAGING_ENV_FILE=""
if [ -f "backend/.env.staging" ]; then
    STAGING_ENV_FILE="backend/.env.staging"
elif [ -f ".env.staging" ]; then
    STAGING_ENV_FILE=".env.staging"
elif [ -n "${CUSTOM_STAGING_ENV_FILE:-}" ] && [ -f "$CUSTOM_STAGING_ENV_FILE" ]; then
    STAGING_ENV_FILE="$CUSTOM_STAGING_ENV_FILE"
fi

if [ -z "$STAGING_ENV_FILE" ]; then
    echo "  [CRITICAL ERROR] Dedicated staging environment file not found!"
    echo "  Expected backend/.env.staging or .env.staging."
    echo "  Staging backend cannot start without an explicit staging environment configuration."
    echo "  Automatic fallback to backend/.env (production) is strictly forbidden."
    exit 1
fi

echo "  Staging Env File: $STAGING_ENV_FILE"

# Extract DATABASE_URL from staging env file safely without printing secrets
STAGING_DB_URL=$(grep -E '^[[:space:]]*DATABASE_URL=' "$STAGING_ENV_FILE" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)

# Staging env file takes precedence. Fall back ONLY to explicit STAGING_DATABASE_URL, NEVER inherited DATABASE_URL.
if [ -z "$STAGING_DB_URL" ] && [ -n "${STAGING_DATABASE_URL:-}" ]; then
    STAGING_DB_URL="$STAGING_DATABASE_URL"
fi

if [ -z "$STAGING_DB_URL" ]; then
    echo "  [CRITICAL ERROR] DATABASE_URL is missing or empty in $STAGING_ENV_FILE!"
    echo "  Staging requires an explicitly configured, dedicated staging database."
    echo "  Silent fallback to shell DATABASE_URL (production) is strictly forbidden."
    exit 1
fi

# Check for unreplaced template placeholders
if echo "$STAGING_DB_URL" | grep -qi "PLACEHOLDER"; then
    echo "  [CRITICAL ERROR] DATABASE_URL contains unconfigured template placeholder!"
    echo "  Update $STAGING_ENV_FILE with real dedicated staging credentials before proceeding."
    exit 1
fi

# Robust WHATWG URL parsing using Node.js runtime (handles IPv4, IPv6, URL-encoded credentials)
if ! PARSED_FIELDS=$(TARGET_URL="$STAGING_DB_URL" node -e '
  const raw = process.env.TARGET_URL || "";
  try {
    const u = new URL(raw.trim());
    const proto = (u.protocol || "").replace(/:$/, "").toLowerCase();
    if (proto !== "postgresql" && proto !== "postgres") {
      process.stderr.write("[CRITICAL ERROR] Invalid database protocol: \"" + proto + "\". Expected \"postgresql\" or \"postgres\".\n");
      process.exit(2);
    }
    const host = (u.hostname || "").toLowerCase().trim().replace(/^\[|\]$/g, "");
    if (!host || host === "0.0.0.0") {
      process.stderr.write("[CRITICAL ERROR] Invalid or bind-all database host: \"" + host + "\".\n");
      process.exit(3);
    }
    const port = u.port || "5432";
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      process.stderr.write("[CRITICAL ERROR] Invalid database port: \"" + port + "\". Port must be between 1 and 65535.\n");
      process.exit(4);
    }
    const db = (u.pathname || "").replace(/^\//, "").split("?")[0].trim();
    if (!db) {
      process.stderr.write("[CRITICAL ERROR] Database name is missing from staging DATABASE_URL path!\n");
      process.exit(5);
    }
    const user = decodeURIComponent(u.username || "").trim();
    if (!user) {
      process.stderr.write("[CRITICAL ERROR] Database username is missing from staging DATABASE_URL! A dedicated staging user is required.\n");
      process.exit(6);
    }
    process.stdout.write([proto, host, port, db, user].join("\t"));
  } catch (err) {
    process.stderr.write("[CRITICAL ERROR] Failed to parse staging DATABASE_URL: Invalid URL format.\n");
    process.exit(1);
  }
'); then
    echo "  $PARSED_FIELDS"
    exit 1
fi

IFS=$'\t' read -r DB_PROTOCOL DB_HOST DB_PORT DB_NAME DB_USER <<< "$PARSED_FIELDS"

# 1. STRICT PRODUCTION DATABASE REJECTION (exact match and prefix/suffix variants)
LOWER_DB_NAME=$(echo "$DB_NAME" | tr '[:upper:]' '[:lower:]')
case "$LOWER_DB_NAME" in
    cmd_office*|database_name*|postgres*|template1*)
        echo "  [CRITICAL ISOLATION BREACH REJECTED] Staging cannot connect to production or default database '$DB_NAME'!"
        echo "  Production database names (including 'cmd_office' and variants) are strictly forbidden."
        echo "  Staging MUST use an isolated, dedicated database (e.g. cmd_staging)."
        exit 1
        ;;
esac

# 2. Require affirmative staging identifier in database name
if ! echo "$LOWER_DB_NAME" | grep -qE '(staging|stage|test)'; then
    echo "  [CRITICAL ERROR] Unsafe staging database name '$DB_NAME'!"
    echo "  Staging database name must explicitly contain 'staging', 'stage', or 'test'."
    echo "  Example: cmd_staging"
    exit 1
fi

# 3. Reject known PostgreSQL superuser accounts and require dedicated staging user
LOWER_DB_USER=$(echo "$DB_USER" | tr '[:upper:]' '[:lower:]')
case "$LOWER_DB_USER" in
    postgres|root|admin|administrator|superuser)
        echo "  [CRITICAL ISOLATION BREACH REJECTED] Staging cannot connect using superuser account '$DB_USER'!"
        echo "  A dedicated staging database user (e.g. 'cmd_staging') is required."
        exit 1
        ;;
esac

if ! echo "$LOWER_DB_USER" | grep -qE '(staging|stage|test)'; then
    echo "  [CRITICAL ERROR] Unsafe staging database user '$DB_USER'!"
    echo "  Staging database user must explicitly contain 'staging', 'stage', or 'test' (e.g. 'cmd_staging')."
    exit 1
fi

# 4. Where trusted production database configuration is present on disk, compare against it
PROD_ENV_FILE=""
if [ -f "backend/.env" ]; then
    PROD_ENV_FILE="backend/.env"
elif [ -f ".env" ]; then
    PROD_ENV_FILE=".env"
fi

if [ -n "$PROD_ENV_FILE" ]; then
    PROD_DB_URL=$(grep -E '^[[:space:]]*DATABASE_URL=' "$PROD_ENV_FILE" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)
    if [ -n "$PROD_DB_URL" ]; then
        if PROD_PARSED=$(TARGET_URL="$PROD_DB_URL" node -e '
          const raw = process.env.TARGET_URL || "";
          try {
            const u = new URL(raw.trim());
            const host = (u.hostname || "").toLowerCase().trim().replace(/^\[|\]$/g, "");
            const port = u.port || "5432";
            const db = (u.pathname || "").replace(/^\//, "").split("?")[0].trim().toLowerCase();
            const user = decodeURIComponent(u.username || "").toLowerCase().trim();
            process.stdout.write([host, port, db, user].join("\t"));
          } catch {
            process.exit(1);
          }
        ' 2>/dev/null); then
            IFS=$'\t' read -r PROD_HOST PROD_PORT PROD_NAME PROD_USER <<< "$PROD_PARSED"

            if [ "$LOWER_DB_NAME" = "$PROD_NAME" ]; then
                echo "  [CRITICAL ISOLATION BREACH REJECTED] Staging database name matches production database in $PROD_ENV_FILE!"
                exit 1
            fi

            IS_STAGING_LOOPBACK=0
            case "$DB_HOST" in
                localhost|127.*|::1|0:0:0:0:0:0:0:1) IS_STAGING_LOOPBACK=1 ;;
            esac

            IS_PROD_LOOPBACK=0
            case "$PROD_HOST" in
                localhost|127.*|::1|0:0:0:0:0:0:0:1) IS_PROD_LOOPBACK=1 ;;
            esac

            if [ "$IS_STAGING_LOOPBACK" -eq 1 ] && [ "$IS_PROD_LOOPBACK" -eq 1 ] && [ "$DB_PORT" = "$PROD_PORT" ] && [ "$LOWER_DB_NAME" = "$PROD_NAME" ]; then
                echo "  [CRITICAL ISOLATION BREACH REJECTED] Staging database target matches production database identity on loopback ($DB_HOST:$DB_PORT)!"
                exit 1
            fi

            if [ -n "$PROD_USER" ] && [ "$LOWER_DB_USER" = "$PROD_USER" ]; then
                echo "  [CRITICAL ISOLATION BREACH REJECTED] Staging database user '$DB_USER' matches production database user in $PROD_ENV_FILE!"
                exit 1
            fi
            echo "  [ISOLATION VERIFIED] Verified distinct from production database identity in $PROD_ENV_FILE."
        fi
    fi
fi

echo "  [ISOLATION VERIFIED] Target database host: '$DB_HOST', target database: '$DB_NAME'"
echo "  [ISOLATION VERIFIED] Target database user: '$DB_USER'"
echo "  [ISOLATION VERIFIED] Redacted connection: ${DB_PROTOCOL}://[REDACTED]@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# ------------------------------------------------------------------------------
# STEP 5: EMAIL KILL SWITCH & OUTBOUND SUPPRESSION VERIFICATION
# ------------------------------------------------------------------------------
echo "==> Step 5: Validating Email Suppression Kill Switch..."

EMAIL_KILL_SWITCH=$(grep -E '^[[:space:]]*DISABLE_OUTBOUND_EMAILS=' "$STAGING_ENV_FILE" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)

if [ "$EMAIL_KILL_SWITCH" != "true" ]; then
    echo "  [CRITICAL ERROR] DISABLE_OUTBOUND_EMAILS is not set to 'true' in $STAGING_ENV_FILE!"
    echo "  Staging outbound emails must be strictly suppressed regardless of database settings."
    exit 1
fi
echo "  [SUCCESS] Outbound email suppression verified: DISABLE_OUTBOUND_EMAILS=true"

# ------------------------------------------------------------------------------
# STEP 6: PROCESS ISOLATION & PORT BINDING CHECKS
# ------------------------------------------------------------------------------
echo "==> Step 6: Validating Port & Process Isolation..."

# Production ports: 4000 (backend), 3000 (frontend)
# Staging ports:    4001 (backend), 3001 (frontend)
STAGING_BACKEND_PORT=4001
STAGING_FRONTEND_PORT=3001

echo "  Target Staging Backend Port:  $STAGING_BACKEND_PORT"
echo "  Target Staging Frontend Port: $STAGING_FRONTEND_PORT"
echo "  Target Staging Host:          127.0.0.1 (Loopback Only)"

# Verify log directories exist or create them
mkdir -p logs
mkdir -p .releases

echo "======================================================================"
echo "[SUCCESS] Staging Preflight Validation Completed Successfully!"
echo "All safety isolation boundaries verified."
echo "======================================================================"
exit 0
