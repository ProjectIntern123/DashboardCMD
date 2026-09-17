#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Production Rollback Script
# Zero-Data-Loss Application Rollback Strategy
# ==============================================================================
set -euo pipefail

echo "======================================================================"
echo "[ROLLBACK STARTED] Initiating Emergency Application Rollback"
echo "======================================================================"

# SAFETY GUARANTEE:
# Additive table 'EmailTemplate' remains intact in PostgreSQL to prevent data loss.

echo "==> Step 1: Reverting Application Code to Previous Commit..."
git reset --hard HEAD~1 || git checkout -- .

echo "==> Step 2: Rebuilding Backend Application..."
cd backend
npm run build
cd ..

echo "==> Step 3: Rebuilding Frontend Application..."
cd frontend
npm run build
cd ..

echo "==> Step 4: Reloading Application Process Manager..."
if command -v pm2 &> /dev/null; then
    pm2 reload ecosystem.config.js || pm2 restart all
elif command -v systemctl &> /dev/null && systemctl is-active --quiet cmd-backend; then
    sudo systemctl restart cmd-backend cmd-frontend
fi

echo "======================================================================"
echo "[ROLLBACK COMPLETE] Application reverted to previous working version."
echo "Note: The database table 'EmailTemplate' was preserved for zero data loss."
echo "======================================================================"
