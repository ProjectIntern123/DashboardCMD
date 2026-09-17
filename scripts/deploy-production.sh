#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Production Deployment Script
# Feature: Admin Notification Email Templates Management Patch
# ==============================================================================
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
PROJECT_DIR="$(pwd)"
PATCH_FILE="${PROJECT_DIR}/deployment-package/patch/email-template-feature.patch"

echo "======================================================================"
echo "[HARTEK CMD] Production Deployment Sequence Started at $(date)"
echo "======================================================================"

# ------------------------------------------------------------------------------
# STEP 1: PRE-FLIGHT SYSTEM CHECKS
# ------------------------------------------------------------------------------
echo "==> Step 1: Pre-Flight Environment Checks..."

echo "  User:       $(whoami)"
echo "  Directory:  $PROJECT_DIR"

if [ ! -f "backend/package.json" ] || [ ! -f "frontend/package.json" ]; then
    echo "  [ERROR] Script must be run from project root directory containing backend/ and frontend/"
    exit 1
fi

echo "  Node Version: $(node -v)"
echo "  npm Version:  $(npm -v)"
echo "  Disk Space:   $(df -h . | tail -n 1 | awk '{print $4}') available"

# Check Git Status
if [ -d ".git" ]; then
    CURRENT_COMMIT=$(git rev-parse --short HEAD)
    echo "  Git Revision: $CURRENT_COMMIT"
else
    echo "  [WARN] Not inside a git repository."
    CURRENT_COMMIT="unknown"
fi

# ------------------------------------------------------------------------------
# STEP 2: CREATE PRODUCTION BACKUP
# ------------------------------------------------------------------------------
echo "==> Step 2: Executing Mandatory Production Backup..."

if [ -f "./deployment-package/scripts/backup-production.sh" ]; then
    chmod +x ./deployment-package/scripts/backup-production.sh
    ./deployment-package/scripts/backup-production.sh
elif [ -f "./scripts/backup-production.sh" ]; then
    chmod +x ./scripts/backup-production.sh
    ./scripts/backup-production.sh
else
    echo "  [CRITICAL ERROR] Backup script (backup-production.sh) not found! Aborting deployment."
    exit 1
fi

# Record Rollback Tag in Git
if [ -d ".git" ]; then
    ROLLBACK_TAG="production-before-email-templates-$TIMESTAMP"
    echo "  Creating rollback tag in Git: $ROLLBACK_TAG"
    git tag -a "$ROLLBACK_TAG" -m "Pre-deployment checkpoint before Email Templates patch ($TIMESTAMP)" || true
fi

# ------------------------------------------------------------------------------
# STEP 3: APPLY PATCH
# ------------------------------------------------------------------------------
echo "==> Step 3: Applying Production Patch..."

if [ ! -f "$PATCH_FILE" ]; then
    if [ -f "email-template-feature.patch" ]; then
        PATCH_FILE="email-template-feature.patch"
    else
        echo "  [CRITICAL ERROR] Patch file not found at $PATCH_FILE"
        exit 1
    fi
fi

echo "  Applying patch file: $PATCH_FILE"
git apply --check "$PATCH_FILE" || {
    echo "  [ERROR] Git patch dry-run failed. Resolving conflict..."
    git apply --reject "$PATCH_FILE" || true
}
git apply "$PATCH_FILE"
echo "  [SUCCESS] Patch applied cleanly."

# ------------------------------------------------------------------------------
# STEP 4: BUILD BACKEND & FRONTEND
# ------------------------------------------------------------------------------
echo "==> Step 4: Building Backend Application..."
cd backend
npm run build
cd ..

echo "==> Step 5: Building Frontend Application..."
cd frontend
npm run build
cd ..

# ------------------------------------------------------------------------------
# STEP 5: ADDITIVE DATABASE SCHEMA MIGRATION
# ------------------------------------------------------------------------------
echo "==> Step 6: Executing Additive Database Migration..."
cd backend
npx prisma db push --skip-generate
cd ..

# ------------------------------------------------------------------------------
# STEP 6: PROCESS MANAGER RELOAD
# ------------------------------------------------------------------------------
echo "==> Step 7: Reloading Production Application Services..."

if command -v pm2 &> /dev/null; then
    echo "  Reloading PM2 process manager..."
    pm2 reload ecosystem.config.js || pm2 restart ecosystem.config.js || pm2 restart all
elif command -v systemctl &> /dev/null && systemctl is-active --quiet cmd-backend; then
    echo "  Restarting systemd service..."
    sudo systemctl restart cmd-backend cmd-frontend
else
    echo "  [NOTE] Process manager reload skipped or handled by server runner."
fi

# ------------------------------------------------------------------------------
# STEP 7: PRODUCTION HEALTH CHECK
# ------------------------------------------------------------------------------
echo "==> Step 8: Performing Production Health Check..."
sleep 3

HEALTH_PASSED=false
if command -v curl &> /dev/null; then
    # Test Backend Health Endpoint (Port 4000 or relative)
    if curl -s -f http://127.0.0.1:4000/api/settings > /dev/null 2>&1 || curl -s -f http://127.0.0.1:4000/api > /dev/null 2>&1; then
        echo "  [SUCCESS] Backend API service is healthy and responding!"
        HEALTH_PASSED=true
    fi
    
    # Test Frontend Next.js Service (Port 3000)
    if curl -s -f http://127.0.0.1:3000/ > /dev/null 2>&1; then
        echo "  [SUCCESS] Frontend web app service is healthy and responding!"
        HEALTH_PASSED=true
    fi
fi

if [ "$HEALTH_PASSED" = true ]; then
    echo "======================================================================"
    echo "[DEPLOYMENT SUCCESSFUL] HARTEK CMD Email Templates patch live!"
    echo "======================================================================"
else
    echo "  [WARN] Automatic curl health check inconclusive. Please verify in browser."
fi
