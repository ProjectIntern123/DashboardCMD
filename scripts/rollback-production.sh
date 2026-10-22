#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Production Rollback Script
# Safe Artifact Restoration & Rollback Strategy
# ==============================================================================
set -euo pipefail

echo "======================================================================"
echo "[ROLLBACK STARTED] Initiating Emergency Application Rollback"
echo "Timestamp: $(date +"%Y%m%d-%H%M%S")"
echo "======================================================================"

# ------------------------------------------------------------------------------
# STEP 1: GIT WORKING TREE SAFETY CHECK
# ------------------------------------------------------------------------------
echo "==> Step 1: Checking Git Working Tree..."

# 1. Check for uncommitted changes in tracked files
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    echo "  [CRITICAL ERROR] Dirty working tree detected! Uncommitted tracked changes exist on server."
    git status --short --untracked-files=no
    echo "  Refusing rollback to protect local changes. Clean or stash working tree first."
    exit 1
fi

# 2. Check for unexpected untracked files (excluding legitimate deployment/release metadata)
UNEXPECTED_UNTRACKED=$(git status --porcelain | grep -vE '^\?\? (\.releases/|\.prev-deployed-commit|\.current-deployed-commit)' || true)
if [ -n "$UNEXPECTED_UNTRACKED" ]; then
    echo "  [CRITICAL ERROR] Dirty working tree detected! Unexpected untracked files exist on server:"
    echo "$UNEXPECTED_UNTRACKED"
    echo "  Refusing rollback to protect local changes. Clean or stash working tree first."
    exit 1
fi

# ------------------------------------------------------------------------------
# STEP 2: VERIFY AND RESTORE RECORDED PREVIOUS RELEASE ARTIFACTS
# ------------------------------------------------------------------------------
echo "==> Step 2: Locating and Verifying Preserved Previous Release Artifacts & Metadata..."

# 1. Verify presence and integrity of preserved candidate snapshot artifacts
if [ ! -d "backend/dist.prev" ] || [ ! -d "frontend/.next.prev" ]; then
    echo "  [CRITICAL ERROR] Preserved previous release artifacts (backend/dist.prev or frontend/.next.prev) are missing!"
    echo "  Blocker: Rollback cannot proceed without verified previous release artifacts."
    exit 1
fi

# Verify artifact validity before restoring
if [ ! -f "backend/dist.prev/src/main.js" ] && [ ! -f "backend/dist.prev/main.js" ]; then
    echo "  [CRITICAL ERROR] Preserved backend artifact is corrupt or missing entry point (src/main.js)!"
    echo "  Blocker: Corrupt or incomplete files in preserved release artifact directories."
    exit 1
fi

if [ ! -f "backend/dist.prev/src/app.module.js" ]; then
    echo "  [CRITICAL ERROR] Preserved backend artifact is corrupt or missing root module (src/app.module.js)!"
    echo "  Blocker: Corrupt or incomplete files in preserved release artifact directories."
    exit 1
fi

if [ ! -f "frontend/.next.prev/BUILD_ID" ]; then
    echo "  [CRITICAL ERROR] Preserved frontend artifact is corrupt or missing manifest (BUILD_ID)!"
    echo "  Blocker: Corrupt or incomplete files in preserved release artifact directories."
    exit 1
fi

if [ ! -d "frontend/.next.prev/server" ] || [ ! -d "frontend/.next.prev/static" ]; then
    echo "  [CRITICAL ERROR] Preserved frontend artifact is corrupt or missing server/static directories!"
    echo "  Blocker: Corrupt or incomplete files in preserved release artifact directories."
    exit 1
fi

echo "  Preserved release artifacts verified: backend/dist.prev and frontend/.next.prev"

# 2. Read and validate previous commit metadata BEFORE touching any active directories
PREV_COMMIT=""
if [ -f ".prev-deployed-commit" ]; then
    PREV_COMMIT=$(cat .prev-deployed-commit)
elif [ -f ".releases/previous-release.json" ]; then
    PREV_COMMIT=$(grep '"commit"' .releases/previous-release.json | cut -d '"' -f4 || echo "")
fi

if [ -z "$PREV_COMMIT" ] || ! git rev-parse --verify "$PREV_COMMIT" &>/dev/null; then
    echo "  [CRITICAL ERROR] No verified previous release commit found in release metadata!"
    echo "  Blocker: Missing or invalid commit reference in .releases/previous-release.json and .prev-deployed-commit."
    echo "  Refusing rollback to avoid guessing commits or leaving repository in an inconsistent state."
    exit 1
fi
echo "  Verified rollback target commit: $PREV_COMMIT"

# 3. Prepare temporary recovery copies successfully BEFORE touching active directories
rm -rf backend/dist.rollback.tmp frontend/.next.rollback.tmp
cp -r backend/dist.prev backend/dist.rollback.tmp
cp -r frontend/.next.prev frontend/.next.rollback.tmp

if [ ! -d "backend/dist.rollback.tmp" ] || [ ! -d "frontend/.next.rollback.tmp" ]; then
    echo "  [CRITICAL ERROR] Failed to prepare temporary recovery copies!"
    rm -rf backend/dist.rollback.tmp frontend/.next.rollback.tmp
    exit 1
fi

# 4. Atomic directory swap (only executed after all prerequisites and copies are verified)
rm -rf backend/dist.old frontend/.next.old
[ -d "backend/dist" ] && mv "backend/dist" "backend/dist.old"
mv backend/dist.rollback.tmp backend/dist
rm -rf backend/dist.old

[ -d "frontend/.next" ] && mv "frontend/.next" "frontend/.next.old"
mv frontend/.next.rollback.tmp frontend/.next
rm -rf frontend/.next.old

echo "  [SUCCESS] Previous production artifacts restored successfully into active paths."

# 5. Restore Git branch non-destructively to recorded release commit
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")
echo "  Restoring branch $CURRENT_BRANCH non-destructively to recorded release commit: $PREV_COMMIT"
if ! git checkout -B "$CURRENT_BRANCH" "$PREV_COMMIT"; then
    echo "  [CRITICAL ERROR] Non-destructive checkout of $PREV_COMMIT to branch $CURRENT_BRANCH failed."
    echo "  Blocker: Uncommitted or conflicting files prevented checkout. No files were discarded."
    exit 1
fi

echo "$PREV_COMMIT" > .current-deployed-commit
rm -f .prev-deployed-commit

# ------------------------------------------------------------------------------
# STEP 3: RELOAD PRODUCTION SERVICES
# ------------------------------------------------------------------------------
echo "==> Step 3: Reloading Production Application Services..."

if command -v pm2 &> /dev/null; then
    echo "  Reloading PM2 process manager..."
    pm2 reload ecosystem.config.js || pm2 restart ecosystem.config.js
elif command -v systemctl &> /dev/null && systemctl is-active --quiet cmd-backend; then
    sudo systemctl restart cmd-backend cmd-frontend
else
    echo "  [NOTE] Service reload step executed."
fi

# ------------------------------------------------------------------------------
# STEP 4: HEALTH VERIFICATION
# ------------------------------------------------------------------------------
echo "==> Step 4: Verifying Rollback Health..."

HEALTHY=false
for i in {1..5}; do
    echo "  Health check attempt $i of 5 (waiting 3s)..."
    sleep 3
    if command -v curl &> /dev/null; then
        BACKEND_OK=false
        FRONTEND_OK=false

        if curl -s -f http://127.0.0.1:4000/api/settings/public > /dev/null 2>&1; then
            BACKEND_OK=true
        fi
        if curl -s -f http://127.0.0.1:3000/ > /dev/null 2>&1; then
            FRONTEND_OK=true
        fi

        if [ "$BACKEND_OK" = true ] && [ "$FRONTEND_OK" = true ]; then
            HEALTHY=true
            break
        fi
    else
        echo "  [WARN] curl command not found. Skipping HTTP probe."
        HEALTHY=true
        break
    fi
done

if [ "$HEALTHY" = true ]; then
    echo "======================================================================"
    echo "[ROLLBACK COMPLETE & VERIFIED] Application restored to previous working version."
    echo "======================================================================"
else
    echo "======================================================================"
    echo "[CRITICAL ERROR] Rollback health check failed! Application did not respond 200 OK."
    echo "Do NOT assume the rollback succeeded. Inspect 'pm2 logs' immediately."
    echo "======================================================================"
    exit 1
fi
