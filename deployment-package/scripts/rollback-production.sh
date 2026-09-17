#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Production Rollback Script
# Zero-Data-Loss Application Rollback Strategy
# ==============================================================================
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
PROJECT_DIR="$(pwd)"
PATCH_FILE="${PROJECT_DIR}/deployment-package/patch/email-template-feature.patch"

echo "======================================================================"
echo "[ROLLBACK STARTED] Initiating safe emergency rollback at $(date)"
echo "======================================================================"

# IMPORTANT SAFETY GUARANTEE:
# We DO NOT drop database tables or execute TRUNCATE/DROP queries.
# Additive table 'EmailTemplate' will remain intact to ensure NO DATA LOSS.

echo "==> Step 1: Reverting Application Code Changes..."

if [ -f "$PATCH_FILE" ]; then
    echo "  Reverse applying patch $PATCH_FILE..."
    git apply -R "$PATCH_FILE" || {
        echo "  [WARN] Reverse patch hit conflicts. Reverting modified files directly via Git..."
        git checkout -- backend/src/app.module.ts \
                       backend/src/audit/audit.interceptor.ts \
                       backend/src/auth/auth.service.ts \
                       backend/src/settings/settings.mailer.ts \
                       backend/src/settings/settings.module.ts \
                       backend/src/user/user.service.ts \
                       frontend/src/app/admin/page.tsx \
                       frontend/src/lib/api.ts
        rm -rf backend/src/email-templates frontend/src/app/admin/components/EmailTemplatesAdmin.tsx
    }
else
    echo "  Reverting git working directory to previous HEAD..."
    git checkout -- .
fi

echo "  [SUCCESS] Code changes reverted cleanly."

# ------------------------------------------------------------------------------
# STEP 2: REBUILD APPLICATION
# ------------------------------------------------------------------------------
echo "==> Step 2: Rebuilding Backend Application..."
cd backend
npm run build
cd ..

echo "==> Step 3: Rebuilding Frontend Application..."
cd frontend
npm run build
cd ..

# ------------------------------------------------------------------------------
# STEP 3: RELOAD PROCESSES
# ------------------------------------------------------------------------------
echo "==> Step 4: Reloading Application Process Manager..."
if command -v pm2 &> /dev/null; then
    pm2 reload ecosystem.config.js || pm2 restart all
elif command -v systemctl &> /dev/null && systemctl is-active --quiet cmd-backend; then
    sudo systemctl restart cmd-backend cmd-frontend
fi

echo "======================================================================"
echo "[ROLLBACK COMPLETE] Application code reverted cleanly."
echo "Note: The database table 'EmailTemplate' was left intact for zero data loss."
echo "======================================================================"
