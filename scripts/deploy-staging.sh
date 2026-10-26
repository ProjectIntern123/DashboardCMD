#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Staging Deployment Script
# Isolated Staging Deployment & Atomic Artifact Activation
# Zero impacts to production data, processes, credentials, or users
# ==============================================================================
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
PROJECT_DIR="$(pwd)"

echo "======================================================================"
echo "[HARTEK CMD] Staging Application Deployment"
echo "Timestamp: $TIMESTAMP"
echo "Directory: $PROJECT_DIR"
echo "======================================================================"

# ------------------------------------------------------------------------------
# STEP 1: RUN PREFLIGHT VALIDATION (FAIL-CLOSED)
# ------------------------------------------------------------------------------
echo "==> Step 1: Running Staging Preflight Checks..."

if [ ! -f "scripts/preflight-staging.sh" ]; then
    echo "  [CRITICAL ERROR] scripts/preflight-staging.sh not found!"
    exit 1
fi

bash scripts/preflight-staging.sh

# ------------------------------------------------------------------------------
# STEP 2: LOAD STAGING ENVIRONMENT & VERIFY DATABASE SAFETY
# ------------------------------------------------------------------------------
echo "==> Step 2: Extracting & Exporting Staging Environment Variables..."

STAGING_ENV_FILE=""
if [ -f "backend/.env.staging" ]; then
    STAGING_ENV_FILE="backend/.env.staging"
elif [ -f ".env.staging" ]; then
    STAGING_ENV_FILE=".env.staging"
fi

if [ -z "$STAGING_ENV_FILE" ]; then
    echo "  [CRITICAL ERROR] Staging environment file not found (backend/.env.staging or .env.staging)!"
    exit 1
fi

# Mandatory Staging Flags
export APP_ENV="staging"
export DEPLOY_ENV="staging"
export STAGING="true"
export DISABLE_OUTBOUND_EMAILS="true"
export ALLOW_OUTBOUND_EMAILS="false"
export NODE_ENV="production"
export PORT="4001"
export HOST="127.0.0.1"

# Extract DATABASE_URL from staging environment file
# The staging environment file takes absolute precedence.
# Only STAGING_DATABASE_URL is accepted as an explicit fallback; shell DATABASE_URL (production) is strictly rejected.
EXTRACTED_DB_URL=$(grep -E '^[[:space:]]*DATABASE_URL=' "$STAGING_ENV_FILE" | head -n1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r' | xargs || true)

if [ -z "$EXTRACTED_DB_URL" ]; then
    if [ -n "${STAGING_DATABASE_URL:-}" ]; then
        EXTRACTED_DB_URL="$STAGING_DATABASE_URL"
    else
        echo "  [CRITICAL ERROR] DATABASE_URL is missing or empty in $STAGING_ENV_FILE!"
        echo "  Staging requires an explicitly configured, dedicated staging database in $STAGING_ENV_FILE."
        echo "  Inheriting shell DATABASE_URL (production) is strictly forbidden."
        exit 1
    fi
fi

export DATABASE_URL="$EXTRACTED_DB_URL"

# ------------------------------------------------------------------------------
# STEP 3: MIGRATION & DATABASE SAFETY LOCK
# ------------------------------------------------------------------------------
echo "==> Step 3: Checking Database Operation Constraints..."
echo "  [SAFETY POLICY] Automatic Prisma migrations, db push, seed, and destructive commands are DISABLED."
echo "  [SAFETY POLICY] Production data cloning, overwriting, or dropping is STRICTLY FORBIDDEN."

# Check if migrations are present in the current branch
if [ -d "backend/prisma/migrations" ] && [ "$(ls -A backend/prisma/migrations 2>/dev/null)" ]; then
    echo "  [NOTE] Prisma migration directory contains files, but automatic execution is disabled."
    echo "  Database operations must be reviewed and executed independently of application builds."
fi

# ------------------------------------------------------------------------------
# STEP 4: PREPARE LOGS & FAILURE CLEANUP TRAP
# ------------------------------------------------------------------------------
# RECOVERY BOUNDARIES DOCUMENTATION:
# 1. Automatic Recovery: Handles any in-script command failure caught by Bash EXIT trap
#    (candidate compilation failure, atomic swap error, PM2 reload failure, health probe failure).
# 2. Manual Recovery: Out-of-band interruptions (e.g. SIGKILL, server crash, power loss)
#    prevent shell traps from running. In such events, running './scripts/rollback-staging.sh'
#    manually restores the verified .prev release.
# 3. Database Safety: Application rollback does NOT touch or reverse the database.
# ------------------------------------------------------------------------------
mkdir -p logs
mkdir -p .releases

DEPLOY_SUCCESS=0
ACTIVATION_STARTED=0
IN_ROLLBACK=0
CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "staging-local")

cleanup_on_failure() {
    local exit_code=$?
    if [ "$DEPLOY_SUCCESS" -ne 1 ]; then
        set +e
        echo "========================================================================="
        if [ "$ACTIVATION_STARTED" -eq 1 ]; then
            echo "[STAGING DEPLOYMENT FAILED AFTER ACTIVATION] (Exit code: $exit_code)"
            if [ "$IN_ROLLBACK" -eq 1 ]; then
                echo "  [CRITICAL ALERT] Rollback already attempted or aborted. Halting."
                exit "$exit_code"
            fi
            IN_ROLLBACK=1
            echo "  ==> Initiating Automated Staging Rollback..."
            if [ -f "./scripts/rollback-staging.sh" ]; then
                bash ./scripts/rollback-staging.sh || echo "  [ALERT] Automated rollback encountered an issue. Inspect logs or run rollback manually."
            else
                echo "  [ALERT] scripts/rollback-staging.sh not found!"
            fi
            exit "$exit_code"
        else
            echo "[STAGING DEPLOYMENT FAILED BEFORE ACTIVATION] Cleaning temporary candidate build artifacts..."
            rm -rf backend/dist.candidate frontend/.next.candidate backend/tsconfig.candidate.json
            rm -rf backend/dist.prev.tmp frontend/.next.prev.tmp
            echo "========================================================================="
            exit "$exit_code"
        fi
    fi
}
trap cleanup_on_failure EXIT

# ------------------------------------------------------------------------------
# STEP 5: ISOLATED CANDIDATE BUILDS
# ------------------------------------------------------------------------------
echo "==> Step 5: Compiling Backend Candidate Release (Isolated Build)..."

rm -rf backend/dist.candidate backend/tsconfig.candidate.json
cat << 'EOF' > backend/tsconfig.candidate.json
{
  "extends": "./tsconfig.build.json",
  "compilerOptions": {
    "outDir": "./dist.candidate"
  }
}
EOF

(cd backend && npx prisma generate && npx nest build -p tsconfig.candidate.json)
rm -f backend/tsconfig.candidate.json

# Verify backend candidate build artifacts
if [ ! -f "backend/dist.candidate/src/main.js" ] && [ ! -f "backend/dist.candidate/main.js" ]; then
    echo "  [CRITICAL ERROR] Backend candidate compilation did not produce expected entry point!"
    rm -rf backend/dist.candidate
    exit 1
fi

if [ ! -f "backend/dist.candidate/src/app.module.js" ]; then
    echo "  [CRITICAL ERROR] Backend candidate compilation did not produce root module!"
    rm -rf backend/dist.candidate
    exit 1
fi
echo "  [SUCCESS] Backend candidate release compiled into dist.candidate."

echo "==> Step 6: Compiling Frontend Candidate Release (Isolated Build)..."
rm -rf frontend/.next.candidate

# Frontend staging build variables per strict Phase 8B-7 requirements:
# NEXT_PUBLIC_API_URL=/api, BACKEND_URL=http://127.0.0.1:4001, APP_ENV=staging, NODE_ENV=production, NEXT_DIST_DIR=.next.candidate
(
  cd frontend && \
  NEXT_PUBLIC_API_URL="/api" \
  BACKEND_URL="http://127.0.0.1:4001" \
  APP_ENV="staging" \
  DEPLOY_ENV="staging" \
  STAGING="true" \
  DISABLE_OUTBOUND_EMAILS="true" \
  NODE_ENV="production" \
  NEXT_DIST_DIR=".next.candidate" \
  npm run build
)

# Verify frontend candidate build artifacts
if [ ! -f "frontend/.next.candidate/BUILD_ID" ]; then
    echo "  [CRITICAL ERROR] Frontend candidate compilation did not produce BUILD_ID!"
    rm -rf frontend/.next.candidate
    exit 1
fi

if [ ! -d "frontend/.next.candidate/server" ] || [ ! -d "frontend/.next.candidate/static" ]; then
    echo "  [CRITICAL ERROR] Frontend candidate compilation is missing server or static directory!"
    rm -rf frontend/.next.candidate
    exit 1
fi
echo "  [SUCCESS] Frontend candidate release compiled into .next.candidate."

# ------------------------------------------------------------------------------
# STEP 7: ATOMIC SNAPSHOT & ACTIVATION
# ------------------------------------------------------------------------------
echo "==> Step 7: Atomically Activating Staging Candidate Artifacts..."

# 1. Snapshot current active staging artifacts to .prev
if [ -d "backend/dist" ]; then
    rm -rf "backend/dist.prev.tmp"
    cp -r "backend/dist" "backend/dist.prev.tmp"
    rm -rf "backend/dist.prev.old"
    [ -d "backend/dist.prev" ] && mv "backend/dist.prev" "backend/dist.prev.old"
    mv "backend/dist.prev.tmp" "backend/dist.prev"
    rm -rf "backend/dist.prev.old"
fi

if [ -d "frontend/.next" ]; then
    rm -rf "frontend/.next.prev.tmp"
    cp -r "frontend/.next" "frontend/.next.prev.tmp"
    rm -rf "frontend/.next.prev.old"
    [ -d "frontend/.next.prev" ] && mv "frontend/.next.prev" "frontend/.next.prev.old"
    mv "frontend/.next.prev.tmp" "frontend/.next.prev"
    rm -rf "frontend/.next.prev.old"
fi

# 2. Record release metadata
cat << EOF > .releases/previous-staging-release.json
{
  "commit": "$CURRENT_COMMIT",
  "timestamp": "$TIMESTAMP",
  "backend_artifact": "backend/dist.prev",
  "frontend_artifact": "frontend/.next.prev"
}
EOF
echo "$CURRENT_COMMIT" > .prev-staging-commit

# 3. Swap candidate artifacts into active paths
ACTIVATION_STARTED=1

if [ -d "backend/dist" ]; then
    rm -rf "backend/dist.old"
    mv "backend/dist" "backend/dist.old"
    mv "backend/dist.candidate" "backend/dist"
    rm -rf "backend/dist.old"
else
    mv "backend/dist.candidate" "backend/dist"
fi

if [ -d "frontend/.next" ]; then
    rm -rf "frontend/.next.old"
    mv "frontend/.next" "frontend/.next.old"
    mv "frontend/.next.candidate" "frontend/.next"
    rm -rf "frontend/.next.old"
else
    mv "frontend/.next.candidate" "frontend/.next"
fi

echo "  [SUCCESS] Staging candidate artifacts atomically activated."

# ------------------------------------------------------------------------------
# STEP 8: RELOAD DEDICATED STAGING PROCESSES (PM2)
# ------------------------------------------------------------------------------
echo "==> Step 8: Reloading PM2 Staging Processes..."

if command -v pm2 &> /dev/null; then
    echo "  Reloading staging configuration: ecosystem.staging.config.js..."
    pm2 reload ecosystem.staging.config.js || pm2 restart ecosystem.staging.config.js
else
    echo "  [NOTE] PM2 command not found; skipping process reload."
fi

# ------------------------------------------------------------------------------
# STEP 9: HEALTH & CONFIGURATION VERIFICATION
# ------------------------------------------------------------------------------
echo "==> Step 9: Performing Staging Health Verification..."

if [ -f "./scripts/verify-staging-health.sh" ]; then
    bash ./scripts/verify-staging-health.sh
else
    echo "  [CRITICAL ERROR] scripts/verify-staging-health.sh not found!"
    exit 1
fi

DEPLOY_SUCCESS=1
echo "======================================================================"
echo "[SUCCESS] Staging Deployment Completed Successfully!"
echo "Timestamp: $(date +"%Y%m%d-%H%M%S")"
echo "Commit:    $CURRENT_COMMIT"
echo "======================================================================"
exit 0
