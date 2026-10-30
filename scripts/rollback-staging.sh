#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Staging Rollback Script
# Safe Artifact Restoration & Rollback for Staging Only
# Never modifies or impacts production processes, data, or configuration
# ==============================================================================
set -euo pipefail

# ------------------------------------------------------------------------------
# INTERRUPT & FAILURE SAFETY TRAPS
# ------------------------------------------------------------------------------
ROLLBACK_SUCCESS=0
ROLLBACK_CLEANUP_DONE=0

cleanup_staging_rollback_on_failure() {
    local exit_code=$?
    if [ "$ROLLBACK_CLEANUP_DONE" -eq 1 ]; then
        exit "$exit_code"
    fi
    ROLLBACK_CLEANUP_DONE=1
    trap - EXIT SIGHUP SIGINT SIGTERM
    set +e
    if [ "$ROLLBACK_SUCCESS" -ne 1 ]; then
        echo "  [STAGING ROLLBACK CLEANUP] Cleaning temporary recovery artifacts..."
        rm -rf backend/dist.rollback.tmp frontend/.next.rollback.tmp
        if [ ! -d "backend/dist" ] && [ -d "backend/dist.old" ]; then
            mv "backend/dist.old" "backend/dist" 2>/dev/null || true
        else
            rm -rf backend/dist.old backend/dist.failed
        fi
        if [ ! -d "frontend/.next" ] && [ -d "frontend/.next.old" ]; then
            mv "frontend/.next.old" "frontend/.next" 2>/dev/null || true
        else
            rm -rf frontend/.next.old frontend/.next.failed
        fi
    fi
    exit "$exit_code"
}

handle_staging_rollback_signal() {
    local sig="$1"
    case "$sig" in
        SIGHUP)  SIGNAL_EXIT_CODE=129 ;;
        SIGINT)  SIGNAL_EXIT_CODE=130 ;;
        SIGTERM) SIGNAL_EXIT_CODE=143 ;;
        *)       SIGNAL_EXIT_CODE=1 ;;
    esac
    echo ""
    echo "  [INTERRUPT] Staging rollback script received $sig signal. Halting safely..."
    exit "$SIGNAL_EXIT_CODE"
}

trap 'handle_staging_rollback_signal SIGHUP' SIGHUP
trap 'handle_staging_rollback_signal SIGINT' SIGINT
trap 'handle_staging_rollback_signal SIGTERM' SIGTERM
trap cleanup_staging_rollback_on_failure EXIT

echo "======================================================================"
echo "[STAGING ROLLBACK STARTED] Initiating Staging Application Rollback"
echo "Timestamp: $(date +"%Y%m%d-%H%M%S")"
echo "======================================================================"

# ------------------------------------------------------------------------------
# SAFETY NOTICE: APPLICATION ROLLBACK BOUNDARIES & DATABASE IMMUTABILITY
# ------------------------------------------------------------------------------
# NON-ATOMIC RECOVERY WINDOW DOCUMENTATION:
# In POSIX user-space, sequentially moving two directories (backend/dist and frontend/.next)
# cannot be executed in a single atomic filesystem transaction.
# - Catchable interruptions (SIGHUP, SIGINT, SIGTERM, error exit):
#   The failure trap catches the event and restores the previous directory from .old if needed.
# - Non-catchable events (SIGKILL, kernel panic, sudden host power loss):
#   Traps cannot run. In such an event, backend/dist.prev and frontend/.next.prev remain
#   untouched and intact on disk. Rerunning 'scripts/rollback-staging.sh' will read
#   the verified .prev snapshots, restore them, and bring services back to a known-good state.
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
# STEP 0: DIRECTORY IDENTITY PROTECTION
# ------------------------------------------------------------------------------
CANONICAL_DIR="$(cd "$(pwd)" && pwd -P)"
KNOWN_PROD_DIRS=(
    "/var/www/cmd-dashboard"
    "/var/www/CMDDashboard"
    "/var/www/cmd_office"
    "/srv/cmd-dashboard"
)
if [ -n "${PROD_PROJECT_DIR:-}" ]; then
    CANONICAL_PROD_TARGET="$(cd "$PROD_PROJECT_DIR" 2>/dev/null && pwd -P || echo "$PROD_PROJECT_DIR")"
    KNOWN_PROD_DIRS+=("$CANONICAL_PROD_TARGET")
fi

for prod_dir in "${KNOWN_PROD_DIRS[@]}"; do
    if [ "$CANONICAL_DIR" = "$prod_dir" ]; then
        echo "  [CRITICAL ISOLATION BREACH] Staging rollback attempted in production directory: '$CANONICAL_DIR'!"
        echo "  Refusing rollback to protect production application."
        exit 1
    fi
done

DIR_BASENAME="$(basename "$CANONICAL_DIR")"
LOWER_DIR_BASENAME=$(echo "$DIR_BASENAME" | tr '[:upper:]' '[:lower:]')
case "$LOWER_DIR_BASENAME" in
    cmd-dashboard|cmddashboard|cmd_office|cmdoffice)
        echo "  [CRITICAL ISOLATION BREACH] Staging rollback cannot run in a production-named directory ('$DIR_BASENAME')!"
        exit 1
        ;;
esac

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

PREV_BUILD_ID=$(cat "frontend/.next.prev/BUILD_ID" 2>/dev/null || echo "")
echo "  [VERIFIED] Preserved artifacts confirmed valid: backend/dist.prev and frontend/.next.prev (BUILD_ID: ${PREV_BUILD_ID:-unknown})."

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
    rm -rf "backend/dist.old"
    mv "backend/dist" "backend/dist.old"
    mv "backend/dist.rollback.tmp" "backend/dist"
    rm -rf "backend/dist.old"
else
    mv "backend/dist.rollback.tmp" "backend/dist"
fi

# Restore frontend
if [ -d "frontend/.next" ]; then
    rm -rf "frontend/.next.old"
    mv "frontend/.next" "frontend/.next.old"
    mv "frontend/.next.rollback.tmp" "frontend/.next"
    rm -rf "frontend/.next.old"
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
# STEP 5: VERIFY STAGING HEALTH AND RELEASE IDENTITY AFTER ROLLBACK
# ------------------------------------------------------------------------------
echo "==> Step 5: Verifying Staging Health & Release Identity Post-Rollback..."

check_http_endpoint() {
    local url="$1"
    if command -v curl &> /dev/null; then
        curl -s -f "$url" > /dev/null 2>&1
        return $?
    elif command -v node &> /dev/null; then
        node -e '
            const http = require("http");
            const url = process.argv[1];
            const req = http.get(url, { timeout: 3000 }, (res) => {
                if (res.statusCode >= 200 && res.statusCode < 400) {
                    process.exit(0);
                } else {
                    process.exit(1);
                }
            });
            req.on("error", () => process.exit(1));
            req.on("timeout", () => { req.destroy(); process.exit(1); });
        ' "$url" > /dev/null 2>&1
        return $?
    else
        return 2
    fi
}

HEALTHY=false
for i in {1..5}; do
    echo "  Staging health check attempt $i of 5 (waiting 3s)..."
    sleep 3
    BACKEND_OK=false
    FRONTEND_OK=false

    if check_http_endpoint "http://127.0.0.1:4001/api/settings/public"; then
        BACKEND_OK=true
    fi
    if check_http_endpoint "http://127.0.0.1:3001/"; then
        if [ -n "${PREV_BUILD_ID:-}" ]; then
            if check_http_endpoint "http://127.0.0.1:3001/_next/static/${PREV_BUILD_ID}/_buildManifest.js"; then
                FRONTEND_OK=true
            else
                FRONTEND_OK=false
            fi
        else
            FRONTEND_OK=true
        fi
    fi

    if [ "$BACKEND_OK" = true ] && [ "$FRONTEND_OK" = true ]; then
        HEALTHY=true
        break
    fi
done

if [ "$HEALTHY" = true ]; then
    ROLLBACK_SUCCESS=1
    echo "======================================================================"
    echo "[SUCCESS] Staging Application Rollback Completed & Verified!"
    echo "Target Staging Services Restored (BUILD_ID: ${PREV_BUILD_ID:-unknown})."
    echo "======================================================================"
    exit 0
else
    echo "======================================================================"
    echo "[CRITICAL ERROR] Staging rollback health check failed!"
    echo "Application did not respond 200 OK or manifest failed verification."
    echo "Inspect staging PM2 logs: pm2 logs --lines 50"
    echo "======================================================================"
    exit 1
fi
