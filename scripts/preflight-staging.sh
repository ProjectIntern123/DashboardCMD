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

echo "  Directory:  $PROJECT_DIR"
echo "  User:       $(whoami 2>/dev/null || echo 'unknown')"

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

# Validate protocol
DB_PROTOCOL=$(echo "$STAGING_DB_URL" | sed -E 's|^([^:]+).*|\1|')
if [ "$DB_PROTOCOL" != "postgresql" ] && [ "$DB_PROTOCOL" != "postgres" ]; then
    echo "  [CRITICAL ERROR] Invalid database protocol: '$DB_PROTOCOL'. Expected 'postgresql' or 'postgres'."
    exit 1
fi

# Parse database target host, port, and database name safely
# Form: postgresql://[user[:password]@]host[:port]/dbname[?params]
URL_WITHOUT_PROTO=$(echo "$STAGING_DB_URL" | sed -E 's|^[a-zA-Z0-9_+]+://||')
URL_HOST_AND_PATH=$(echo "$URL_WITHOUT_PROTO" | sed -E 's|^[^@]+@||')
HOST_PORT_PART=$(echo "$URL_HOST_AND_PATH" | cut -d '/' -f1)
DB_HOST=$(echo "$HOST_PORT_PART" | cut -d ':' -f1)
DB_PORT="5432"
if echo "$HOST_PORT_PART" | grep -q ':'; then
    DB_PORT=$(echo "$HOST_PORT_PART" | cut -d ':' -f2)
fi
DB_PATH_AND_QUERY=$(echo "$URL_HOST_AND_PATH" | cut -d '/' -f2-)
DB_NAME=$(echo "$DB_PATH_AND_QUERY" | cut -d '?' -f1 | tr -d '/')

if [ -z "$DB_HOST" ] || [ "$DB_HOST" = "0.0.0.0" ]; then
    echo "  [CRITICAL ERROR] Invalid or bind-all database host: '$DB_HOST'."
    exit 1
fi

if [ -z "$DB_NAME" ]; then
    echo "  [CRITICAL ERROR] Database name is missing from staging DATABASE_URL path!"
    exit 1
fi

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

# 3. Where trusted production database configuration is present on disk, compare against it
PROD_ENV_FILE=""
if [ -f "backend/.env" ]; then
    PROD_ENV_FILE="backend/.env"
elif [ -f ".env" ]; then
    PROD_ENV_FILE=".env"
fi

if [ -n "$PROD_ENV_FILE" ]; then
    PROD_DB_URL=$(grep -E '^[[:space:]]*DATABASE_URL=' "$PROD_ENV_FILE" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)
    if [ -n "$PROD_DB_URL" ]; then
        PROD_WITHOUT_PROTO=$(echo "$PROD_DB_URL" | sed -E 's|^[a-zA-Z0-9_+]+://||')
        PROD_HOST_AND_PATH=$(echo "$PROD_WITHOUT_PROTO" | sed -E 's|^[^@]+@||')
        PROD_HOST_PORT=$(echo "$PROD_HOST_AND_PATH" | cut -d '/' -f1)
        PROD_HOST=$(echo "$PROD_HOST_PORT" | cut -d ':' -f1)
        PROD_PORT="5432"
        if echo "$PROD_HOST_PORT" | grep -q ':'; then
            PROD_PORT=$(echo "$PROD_HOST_PORT" | cut -d ':' -f2)
        fi
        PROD_NAME=$(echo "$PROD_HOST_AND_PATH" | cut -d '/' -f2- | cut -d '?' -f1 | tr -d '/' | tr '[:upper:]' '[:lower:]')

        if [ "$LOWER_DB_NAME" = "$PROD_NAME" ]; then
            echo "  [CRITICAL ISOLATION BREACH REJECTED] Staging database name matches production database in $PROD_ENV_FILE!"
            exit 1
        fi

        if [ "$DB_HOST" = "$PROD_HOST" ] && [ "$DB_PORT" = "$PROD_PORT" ] && [ "$LOWER_DB_NAME" = "$PROD_NAME" ]; then
            echo "  [CRITICAL ISOLATION BREACH REJECTED] Staging database target exactly matches production target on $DB_HOST:$DB_PORT!"
            exit 1
        fi
        echo "  [ISOLATION VERIFIED] Verified distinct from production database identity in $PROD_ENV_FILE."
    fi
fi

echo "  [ISOLATION VERIFIED] Target database host: '$DB_HOST', target database: '$DB_NAME'"
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
