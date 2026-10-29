#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Staging Rollback Script
# Safe Artifact Restoration & Rollback for Staging Only
# Never modifies or impacts production processes, data, or configuration
# ==============================================================================
set -euo pipefail

echo "======================================================================"
echo "[STAGING ROLLBACK STARTED] Initiating Staging Application Rollback"
echo "Timestamp: $(date +"%Y%m%d-%H%M%S")"
echo "======================================================================"

# ------------------------------------------------------------------------------
# SAFETY NOTICE: APPLICATION ROLLBACK BOUNDARIES & DATABASE IMMUTABILITY
# ------------------------------------------------------------------------------
echo "==> Architecture & Scope Notice:"
echo "  [NOTICE] Scope Isolation: Staging rollback operates strictly at the application"
echo "            artifact layer for staging services (cmd-staging-backend, cmd-staging-frontend)."
echo "            Production directories and production PM2 processes are NEVER touched."
echo "  [NOTICE] Failure Recovery Boundaries:"
echo "            - Automatic Recovery: deployment failures caught by Bash EXIT trap"
echo "              invoke this rollback script automatically."
echo "            - Manual Recovery: out-of-band interruptions (SIGKILL, kernel panic, power loss)"
echo "              bypass shell traps and require manual execution of this script."
echo "  [WARNING] Database Immutability: Application rollback does NOT reverse database"
echo "            schema changes, table alterations, or migrations."
echo "            Zero database rollback or destructive data operations will be executed."
echo "----------------------------------------------------------------------"

# ------------------------------------------------------------------------------
# STEP 1: VERIFY INTEGRITY OF PREVIOUS STAGING ARTIFACTS
# ------------------------------------------------------------------------------
echo "==> Step 1: Locating and Verifying Preserved Previous Staging Artifacts..."

if [ ! -d "backend/dist.prev" ] || [ ! -d "frontend/.next.prev" ]; then
    echo "  [CRITICAL ERROR] Preserved previous staging artifacts (backend/dist.prev or frontend/.next.prev) are missing!"
    echo "  Blocker: Rollback cannot proceed safely without verified previous release artifacts."
    exit 1
fi

# Verify backend artifact integrity
if [ ! -f "backend/dist.prev/src/main.js" ] && [ ! -f "backend/dist.prev/main.js" ]; then
    echo "  [CRITICAL ERROR] Preserved backend artifact is corrupt or missing entry point (src/main.js)!"
    exit 1
fi

if [ ! -f "backend/dist.prev/src/app.module.js" ]; then
    echo "  [CRITICAL ERROR] Preserved backend artifact is corrupt or missing root module (src/app.module.js)!"
    exit 1
fi

# Verify frontend artifact integrity
if [ ! -f "frontend/.next.prev/BUILD_ID" ]; then
    echo "  [CRITICAL ERROR] Preserved frontend artifact is corrupt or missing manifest (BUILD_ID)!"
    exit 1
fi

if [ ! -d "frontend/.next.prev/server" ] || [ ! -d "frontend/.next.prev/static" ]; then
    echo "  [CRITICAL ERROR] Preserved frontend artifact is corrupt or missing server/static directories!"
    exit 1
fi

echo "  [VERIFIED] Preserved artifacts confirmed valid: backend/dist.prev and frontend/.next.prev."

# Read rollback commit metadata if available
ROLLBACK_COMMIT=""
if [ -f ".prev-staging-commit" ]; then
    ROLLBACK_COMMIT=$(cat .prev-staging-commit | tr -d '\r\n')
elif [ -f ".releases/previous-staging-release.json" ]; then
    ROLLBACK_COMMIT=$(grep '"commit"' .releases/previous-staging-release.json | cut -d '"' -f4 || echo "")
fi

if [ -n "$ROLLBACK_COMMIT" ]; then
    echo "  Rollback target commit: $ROLLBACK_COMMIT"
fi

# ------------------------------------------------------------------------------
# STEP 2: PREPARE RECOVERY COPIES BEFORE TOUCHING ACTIVE DIRECTORIES
# ------------------------------------------------------------------------------
echo "==> Step 2: Preparing Temporary Recovery Copies..."

rm -rf backend/dist.rollback.tmp frontend/.next.rollback.tmp
cp -r backend/dist.prev backend/dist.rollback.tmp
cp -r frontend/.next.prev frontend/.next.rollback.tmp

if [ ! -d "backend/dist.rollback.tmp" ] || [ ! -d "frontend/.next.rollback.tmp" ]; then
    echo "  [CRITICAL ERROR] Failed to prepare temporary staging recovery copies!"
    rm -rf backend/dist.rollback.tmp frontend/.next.rollback.tmp
    exit 1
fi

# ------------------------------------------------------------------------------
# STEP 3: ATOMICALLY SWAP ARTIFACTS INTO ACTIVE STAGING PATHS
# ------------------------------------------------------------------------------
echo "==> Step 3: Activating Previous Release Artifacts..."

# Restore backend
if [ -d "backend/dist" ]; then
    rm -rf "backend/dist.failed"
    mv "backend/dist" "backend/dist.failed"
    mv "backend/dist.rollback.tmp" "backend/dist"
    rm -rf "backend/dist.failed"
else
    mv "backend/dist.rollback.tmp" "backend/dist"
fi

# Restore frontend
if [ -d "frontend/.next" ]; then
    rm -rf "frontend/.next.failed"
    mv "frontend/.next" "frontend/.next.failed"
    mv "frontend/.next.rollback.tmp" "frontend/.next"
    rm -rf "frontend/.next.failed"
else
    mv "frontend/.next.rollback.tmp" "frontend/.next"
fi

echo "  [SUCCESS] Preserved release artifacts restored to active paths."

# ------------------------------------------------------------------------------
# STEP 4: RELOAD STAGING SERVICES ONLY (PM2)
# ------------------------------------------------------------------------------
echo "==> Step 4: Reloading Staging Services..."

if command -v pm2 &> /dev/null; then
    echo "  Reloading PM2 staging configuration (ecosystem.staging.config.js)..."
    pm2 reload ecosystem.staging.config.js || pm2 restart ecosystem.staging.config.js
else
    echo "  [NOTE] PM2 not installed; skipped PM2 process reload."
fi

# ------------------------------------------------------------------------------
# STEP 5: VERIFY STAGING HEALTH AFTER ROLLBACK
# ------------------------------------------------------------------------------
echo "==> Step 5: Verifying Staging Health Post-Rollback..."

if [ -f "./scripts/verify-staging-health.sh" ]; then
    bash ./scripts/verify-staging-health.sh
else
    echo "  [WARN] scripts/verify-staging-health.sh not found. Probe manually on 4001/3001."
fi

echo "======================================================================"
echo "[SUCCESS] Staging Application Rollback Completed Successfully!"
echo "Target Staging Services Restored."
echo "======================================================================"
exit 0
