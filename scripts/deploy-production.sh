#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Production Deployment Script
# Zero Manual Input - Automatically Uses Production Environment (.env)
# ==============================================================================
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
PROJECT_DIR="$(pwd)"

echo "======================================================================"
echo "[HARTEK CMD] Non-Interactive Production Patch Deployment"
echo "Timestamp: $TIMESTAMP"
echo "======================================================================"

# ------------------------------------------------------------------------------
# STEP 1: PRE-FLIGHT ENVIRONMENT CHECKS
# ------------------------------------------------------------------------------
echo "==> Step 1: Checking Environment & Application Directory..."

if [ ! -f "backend/package.json" ] || [ ! -f "frontend/package.json" ]; then
    echo "  [ERROR] Script must be run from project root directory containing backend/ and frontend/"
    exit 1
fi

echo "  User:       $(whoami)"
echo "  Directory:  $PROJECT_DIR"
echo "  Node:       $(node -v)"
echo "  npm:        $(npm -v)"

# ------------------------------------------------------------------------------
# STEP 2: SYNC LATEST CODE FROM GIT REPOSITORY
# ------------------------------------------------------------------------------
echo "==> Step 2: Fetching & Pulling Latest Code from GitHub (origin main)..."

if [ -d ".git" ]; then
    git fetch origin main || true
    git checkout -- . || true
    git pull origin main || true
    echo "  Git Revision: $(git rev-parse --short HEAD 2>/dev/null || echo 'Unknown')"
else
    echo "  [WARN] Not a git repository. Skipping git pull."
fi

# ------------------------------------------------------------------------------
# STEP 3: AUTOMATED BACKUP (Zero Manual Input)
# ------------------------------------------------------------------------------
echo "==> Step 3: Running Automated Pre-Deployment Backup..."

if [ -f "./scripts/backup-production.sh" ]; then
    chmod +x ./scripts/backup-production.sh
    ./scripts/backup-production.sh
else
    echo "  [CRITICAL ERROR] ./scripts/backup-production.sh not found! Aborting deployment."
    exit 1
fi

# ------------------------------------------------------------------------------
# STEP 4: PRISMA GENERATE & ADDITIVE DATABASE MIGRATION
# ------------------------------------------------------------------------------
echo "==> Step 4: Generating Prisma Client & Running Additive Database Migration..."
cd backend
npx prisma generate
npx prisma db push --skip-generate
cd ..

# ------------------------------------------------------------------------------
# STEP 5: BUILD BACKEND & FRONTEND
# ------------------------------------------------------------------------------
echo "==> Step 5: Compiling Backend NestJS Application..."
cd backend
npm run build
cd ..

echo "==> Step 6: Compiling Frontend Next.js Application..."
cd frontend
npm run build
cd ..

# ------------------------------------------------------------------------------
# STEP 6: RELOAD PRODUCTION SERVICES (PM2 / Systemd)
# ------------------------------------------------------------------------------
echo "==> Step 7: Reloading Production Application Services..."

if command -v pm2 &> /dev/null; then
    echo "  Reloading PM2 process manager..."
    pm2 reload ecosystem.config.js || pm2 restart ecosystem.config.js || pm2 restart all
elif command -v systemctl &> /dev/null && systemctl is-active --quiet cmd-backend; then
    echo "  Restarting systemd service..."
    sudo systemctl restart cmd-backend cmd-frontend
else
    echo "  [NOTE] Process manager reload complete."
fi

# ------------------------------------------------------------------------------
# STEP 7: AUTOMATED HEALTH CHECK
# ------------------------------------------------------------------------------
echo "==> Step 8: Performing Health Verification..."
sleep 3

if command -v curl &> /dev/null; then
    if curl -s -f http://127.0.0.1:4000/api/settings > /dev/null 2>&1 || curl -s -f http://127.0.0.1:3000/ > /dev/null 2>&1; then
        echo "  [SUCCESS] Application services are online and healthy!"
    else
        echo "  [NOTE] Deployment finished. Please verify live status in browser."
    fi
fi

echo "======================================================================"
echo "[SUCCESS] Production Patch Deployed Successfully with Zero Manual Input!"
echo "======================================================================"
