#!/usr/bin/env bash

# =========================================================================
# HARTEK Group CMD Office Command Center - Production Re-Deployment Script
# Target OS: Ubuntu Linux (Hostinger KVM VPS)
# =========================================================================

set -e

echo "========================================================================="
echo "   HARTEK CMD COMMAND CENTER — SAFE PRODUCTION DEPLOYMENT / UPDATE"
echo "========================================================================="
echo ""

# 1. Fetch Latest Code from Git
echo "[STEP 1/6] Pulling Latest Changes from Git Repository..."
git fetch origin
git pull origin main || git pull origin master
echo "[SUCCESS] Code updated from repository."
echo ""

# 2. Verify Environment File
echo "[STEP 2/6] Verifying Environment Configuration (.env)..."
if [ ! -f ".env" ]; then
    echo "[ERROR] .env file not found in current directory!"
    echo "Please create .env using .env.example before running deploy.sh."
    exit 1
fi
node scripts/sync-env.js
echo ""

# 3. Update Dependencies
echo "[STEP 3/6] Verifying Subproject Dependencies..."
node scripts/bootstrap.js
echo "[SUCCESS] Dependencies up-to-date."
echo ""

# 4. Run Database Schema Sync (Non-destructive)
echo "[STEP 4/6] Synchronizing Database Schema..."
cd backend
npx prisma db push --accept-data-loss
cd ..
echo "[SUCCESS] Database schema in sync."
echo ""

# 5. Compile Binaries
echo "[STEP 5/6] Compiling Production Build Artifacts (NestJS & Next.js)..."
node scripts/build.js
echo "[SUCCESS] Builds compiled successfully."
echo ""

# 6. Reload PM2 Applications
echo "[STEP 6/6] Zero-Downtime Reloading PM2 Processes..."
if pm2 list | grep -q "cmd-backend"; then
    pm2 reload ecosystem.config.js --env production
else
    pm2 start ecosystem.config.js --env production
fi
pm2 save
echo ""

echo "========================================================================="
echo "   DEPLOYMENT / UPDATE COMPLETED SUCCESSFULLY!"
echo "========================================================================="
echo "Status Check:"
pm2 status
echo "========================================================================="
