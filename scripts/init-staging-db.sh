#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Staging Database Initialization Script
# Controlled, gated, first-time schema initialization and synthetic seeding
# Zero impact to production data, users, processes, or credentials
# ==============================================================================
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
PROJECT_DIR="$(pwd)"

echo "======================================================================"
echo "[HARTEK CMD] Staging Database Schema & Synthetic Seed Initialization"
echo "Timestamp: $TIMESTAMP"
echo "Directory: $PROJECT_DIR"
echo "======================================================================"

# ------------------------------------------------------------------------------
# STEP 1: DIRECTORY & WORKSPACE CHECKS
# ------------------------------------------------------------------------------
if [ ! -f "backend/package.json" ] || [ ! -f "frontend/package.json" ]; then
    echo "  [CRITICAL ERROR] Script must be run from project root directory containing backend/ and frontend/."
    exit 1
fi

if [ ! -f "ecosystem.staging.config.js" ]; then
    echo "  [CRITICAL ERROR] ecosystem.staging.config.js not found in project root."
    exit 1
fi

# ------------------------------------------------------------------------------
# STEP 2: LOAD STAGING ENVIRONMENT (STRICT PRECEDENCE)
# ------------------------------------------------------------------------------
echo "==> Step 1: Loading Dedicated Staging Environment..."

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
    echo "  Automatic fallback to backend/.env (production) is strictly forbidden."
    exit 1
fi

echo "  Staging Configuration: $STAGING_ENV_FILE"

# Extract and verify staging environment flags
APP_ENV=$(grep -E '^[[:space:]]*APP_ENV=' "$STAGING_ENV_FILE" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)
DEPLOY_ENV=$(grep -E '^[[:space:]]*DEPLOY_ENV=' "$STAGING_ENV_FILE" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)
STAGING_FLAG=$(grep -E '^[[:space:]]*STAGING=' "$STAGING_ENV_FILE" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)

if [ "$APP_ENV" != "staging" ] && [ "$DEPLOY_ENV" != "staging" ] && [ "$STAGING_FLAG" != "true" ]; then
    echo "  [CRITICAL ERROR] Target environment is NOT identified as staging in $STAGING_ENV_FILE!"
    echo "  Must set APP_ENV=staging, DEPLOY_ENV=staging, or STAGING=true."
    exit 1
fi

# Extract DATABASE_URL from staging env file safely
STAGING_DB_URL=$(grep -E '^[[:space:]]*DATABASE_URL=' "$STAGING_ENV_FILE" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)

if [ -z "$STAGING_DB_URL" ] && [ -n "${STAGING_DATABASE_URL:-}" ]; then
    STAGING_DB_URL="$STAGING_DATABASE_URL"
fi

if [ -z "$STAGING_DB_URL" ]; then
    echo "  [CRITICAL ERROR] DATABASE_URL is missing or empty in $STAGING_ENV_FILE!"
    echo "  Inheriting shell DATABASE_URL (production) is strictly forbidden."
    exit 1
fi

if echo "$STAGING_DB_URL" | grep -qi "PLACEHOLDER"; then
    echo "  [CRITICAL ERROR] DATABASE_URL contains unconfigured template placeholder!"
    echo "  Update $STAGING_ENV_FILE with real dedicated staging credentials before proceeding."
    exit 1
fi

# ------------------------------------------------------------------------------
# STEP 3: PARSE & VALIDATE DATABASE TARGET SAFETY
# ------------------------------------------------------------------------------
echo "==> Step 2: Validating Database Safety & Isolation Guards..."

DB_PROTOCOL=$(echo "$STAGING_DB_URL" | sed -E 's|^([^:]+).*|\1|')
if [ "$DB_PROTOCOL" != "postgresql" ] && [ "$DB_PROTOCOL" != "postgres" ]; then
    echo "  [CRITICAL ERROR] Invalid database protocol: '$DB_PROTOCOL'. Expected 'postgresql' or 'postgres'."
    exit 1
fi

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

# 1. Reject production database names and variants
LOWER_DB_NAME=$(echo "$DB_NAME" | tr '[:upper:]' '[:lower:]')
case "$LOWER_DB_NAME" in
    cmd_office*|database_name*|postgres*|template1*)
        echo "  [CRITICAL ISOLATION BREACH REJECTED] Staging cannot connect to production or default database '$DB_NAME'!"
        echo "  Production database names (including 'cmd_office' and its variants) are strictly forbidden."
        exit 1
        ;;
esac

# 2. Require affirmative staging identifier in database name
if ! echo "$LOWER_DB_NAME" | grep -qE '(staging|stage|test)'; then
    echo "  [CRITICAL ERROR] Unsafe staging database name '$DB_NAME'!"
    echo "  Staging database name must explicitly contain 'staging', 'stage', or 'test'."
    exit 1
fi

# 3. Compare against production configuration if on disk
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
        PROD_NAME=$(echo "$PROD_HOST_AND_PATH" | cut -d '/' -f2- | cut -d '?' -f1 | tr -d '/' | tr '[:upper:]' '[:lower:]')

        if [ "$LOWER_DB_NAME" = "$PROD_NAME" ]; then
            echo "  [CRITICAL ISOLATION BREACH REJECTED] Staging database name matches production database in $PROD_ENV_FILE!"
            exit 1
        fi
    fi
fi

REDACTED_URL="${DB_PROTOCOL}://[REDACTED]@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "  [ISOLATION VERIFIED] Target database host: '$DB_HOST'"
echo "  [ISOLATION VERIFIED] Target database name: '$DB_NAME'"
echo "  [ISOLATION VERIFIED] Redacted target:     $REDACTED_URL"

# ------------------------------------------------------------------------------
# STEP 4: OPERATOR CONFIRMATION GATE
# ------------------------------------------------------------------------------
NON_INTERACTIVE=0
if [ "${1:-}" = "--yes" ] || [ "${1:-}" = "-y" ] || [ "${FORCE_CONFIRM:-}" = "1" ]; then
    NON_INTERACTIVE=1
fi

if [ "$NON_INTERACTIVE" -eq 0 ]; then
    echo ""
    echo "========================================================================="
    echo "  CAUTION: Staging Database Schema Initialization & Synthetic Seeding"
    echo "  Target Database: $REDACTED_URL"
    echo "  Policy:          Synthetic data only. Zero production data cloning."
    echo "========================================================================="
    read -r -p "Type 'INIT-STAGING' to confirm and proceed: " OPERATOR_INPUT
    if [ "$OPERATOR_INPUT" != "INIT-STAGING" ]; then
        echo "  [ABORTED] Initialization aborted by operator."
        exit 1
    fi
    echo "  [CONFIRMED] Operator confirmation received."
else
    echo "  [NON-INTERACTIVE] Confirmation flag received (--yes)."
fi

# ------------------------------------------------------------------------------
# STEP 5: PRISMA SCHEMA INITIALIZATION (GATED SUB-SHELL EXECUTION)
# ------------------------------------------------------------------------------
echo "==> Step 3: Generating Prisma Client & Initializing Schema..."

# Generate client offline
(cd backend && npx prisma generate)

# Push schema directly to verified staging database in isolated subshell
echo "  Pushing schema to $REDACTED_URL..."
(
    cd backend && \
    export APP_ENV="staging" && \
    export DEPLOY_ENV="staging" && \
    export STAGING="true" && \
    export DISABLE_OUTBOUND_EMAILS="true" && \
    export DATABASE_URL="$STAGING_DB_URL" && \
    npx prisma db push --schema=prisma/schema.prisma --skip-generate
)

echo "  [SUCCESS] Staging schema initialized in $DB_NAME."

# ------------------------------------------------------------------------------
# STEP 6: SYNTHETIC DATA SEEDING
# ------------------------------------------------------------------------------
echo "==> Step 4: Seeding Synthetic Test Fixtures..."

STAGING_ADMIN_PWD=$(grep -E '^[[:space:]]*STAGING_ADMIN_PASSWORD=' "$STAGING_ENV_FILE" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)
if [ -z "$STAGING_ADMIN_PWD" ] && [ -n "${STAGING_ADMIN_PASSWORD:-}" ]; then
    STAGING_ADMIN_PWD="$STAGING_ADMIN_PASSWORD"
fi

if [ -n "$STAGING_ADMIN_PWD" ]; then
    (
        cd backend && \
        export APP_ENV="staging" && \
        export DEPLOY_ENV="staging" && \
        export STAGING="true" && \
        export DISABLE_OUTBOUND_EMAILS="true" && \
        export DATABASE_URL="$STAGING_DB_URL" && \
        export STAGING_ADMIN_PASSWORD="$STAGING_ADMIN_PWD" && \
        npx ts-node prisma/seed.staging.ts
    )
    echo "  [SUCCESS] Synthetic test users and RBAC fixtures seeded."
else
    echo ""
    echo "  [NOTICE] STAGING_ADMIN_PASSWORD was not found in $STAGING_ENV_FILE or shell."
    echo "  Schema initialization succeeded, but synthetic user seeding was skipped."
    echo "  To seed synthetic users, set STAGING_ADMIN_PASSWORD in $STAGING_ENV_FILE and run:"
    echo "    (cd backend && npx ts-node prisma/seed.staging.ts)"
fi

echo "======================================================================"
echo "[SUCCESS] Staging Database Initialization Completed Successfully!"
echo "Target: $REDACTED_URL"
echo "======================================================================"
exit 0
