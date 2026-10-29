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

# ------------------------------------------------------------------------------
# CONCURRENCY CONTROL: NON-BLOCKING MUTUAL EXCLUSION LOCK
# ------------------------------------------------------------------------------
# Prevent multiple deployment instances from executing simultaneously against the
# same repository and build directories.
# Location: $PROJECT_DIR/.releases/deploy.lock (already in .gitignore and protected from git status)
# Configurable via DEPLOY_LOCK_FILE for customized environments and isolated testing.
mkdir -p "$PROJECT_DIR/.releases"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-$PROJECT_DIR/.releases/deploy.lock}"
LOCK_FD=200
LOCK_ACQUIRED=0

release_deployment_lock() {
    if [ "$LOCK_ACQUIRED" -eq 1 ]; then
        if command -v flock &> /dev/null; then
            eval "exec ${LOCK_FD}>&-" 2>/dev/null || true
        else
            local lock_dir="${DEPLOY_LOCK_FILE}.dir"
            if [ -d "$lock_dir" ] && [ -f "$lock_dir/pid" ]; then
                local pid_val
                pid_val=$(cat "$lock_dir/pid" 2>/dev/null || echo "")
                if [ "$pid_val" = "$$" ]; then
                    rm -rf "$lock_dir"
                fi
            fi
        fi
        LOCK_ACQUIRED=0
    fi
}

acquire_deployment_lock() {
    if command -v flock &> /dev/null; then
        eval "exec ${LOCK_FD}>\"$DEPLOY_LOCK_FILE\""
        if ! flock -n "$LOCK_FD"; then
            echo "  [CRITICAL ERROR] Another deployment instance is currently active!"
            echo "  Lock file '$DEPLOY_LOCK_FILE' is held by another process."
            echo "  Refusing concurrent deployment to prevent repository, build cache, and runtime corruption."
            exit 1
        fi
        LOCK_ACQUIRED=1
    else
        local lock_dir="${DEPLOY_LOCK_FILE}.dir"
        if ! mkdir "$lock_dir" 2>/dev/null; then
            local lock_pid=""
            if [ -f "$lock_dir/pid" ]; then
                lock_pid=$(cat "$lock_dir/pid" 2>/dev/null || echo "")
            fi

            # If PID file was unwritten or empty, wait briefly (100ms) for holder initialization
            if [ -z "$lock_pid" ]; then
                sleep 0.1
                if [ -f "$lock_dir/pid" ]; then
                    lock_pid=$(cat "$lock_dir/pid" 2>/dev/null || echo "")
                fi
            fi

            # Check if PID is malformed / non-numeric (fail closed on corrupt lock metadata)
            if [ -n "$lock_pid" ] && ! [[ "$lock_pid" =~ ^[0-9]+$ ]]; then
                echo "  [CRITICAL ERROR] Corrupt or malformed lock PID file detected ('$lock_pid') in '$lock_dir/pid'."
                echo "  Refusing deployment to prevent unsafe stale-lock reclamation. Manual investigation required."
                exit 1
            fi

            # Check if holder process is actively running
            if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
                echo "  [CRITICAL ERROR] Another deployment instance is currently active!"
                echo "  Lock directory '$lock_dir' is held by active process (PID: $lock_pid)."
                echo "  Refusing concurrent deployment to prevent repository, build cache, and runtime corruption."
                exit 1
            fi

            # Holder process is dead or PID was permanently empty (stale lock).
            # Atomic reclamation: Use atomic directory rename (mv) to isolate the stale directory.
            # Blind rm -rf followed by mkdir is vulnerable to interleaving where another concurrent
            # reclaimer's fresh lock directory gets deleted.
            # Atomic rename guarantees that exactly one process acquires reclamation rights;
            # any competing process attempting mv will fail with ENOENT and must fail closed.
            local reclaim_dir="${lock_dir}.reclaim.$$.$RANDOM"
            rm -rf "$reclaim_dir" 2>/dev/null || true
            if mv "$lock_dir" "$reclaim_dir" 2>/dev/null; then
                # Won reclamation rights. Establish new lock directory.
                if mkdir "$lock_dir" 2>/dev/null; then
                    echo "$$" > "$lock_dir/pid"
                    rm -rf "$reclaim_dir" 2>/dev/null || true
                    LOCK_ACQUIRED=1
                else
                    rm -rf "$reclaim_dir" 2>/dev/null || true
                    echo "  [CRITICAL ERROR] Another deployment instance is currently active!"
                    echo "  Lock directory was re-acquired by another process immediately after reclamation."
                    echo "  Refusing concurrent deployment to prevent repository, build cache, and runtime corruption."
                    exit 1
                fi
            else
                # Another process won the atomic rename race or directory was already reclaimed
                echo "  [CRITICAL ERROR] Another deployment instance is currently active!"
                echo "  Failed to reclaim stale lock directory; another concurrent process acquired it."
                echo "  Refusing concurrent deployment to prevent repository, build cache, and runtime corruption."
                exit 1
            fi
        else
            echo "$$" > "$lock_dir/pid"
            LOCK_ACQUIRED=1
        fi
    fi
}

acquire_deployment_lock

# ------------------------------------------------------------------------------
# FAILURE CLEANUP & SIGNAL TRAP REGISTRATION
# ------------------------------------------------------------------------------
DEPLOY_SUCCESS=0
ACTIVATION_STARTED=0
IN_ROLLBACK=0
CLEANUP_EXECUTED=0
RECEIVED_SIGNAL=""

cleanup_on_failure() {
    local exit_code=$?

    # Guarantee cleanup runs strictly once and disarm all signals to prevent recursion
    if [ "$CLEANUP_EXECUTED" -eq 1 ]; then
        release_deployment_lock
        exit "$exit_code"
    fi
    CLEANUP_EXECUTED=1
    trap - EXIT SIGHUP SIGINT SIGTERM
    set +e

    if [ "$DEPLOY_SUCCESS" -ne 1 ]; then
        echo "========================================================================="
        if [ -n "$RECEIVED_SIGNAL" ]; then
            echo "[DEPLOYMENT INTERRUPTED BY SIGNAL: $RECEIVED_SIGNAL] (Exit code: $exit_code)"
        fi

        if [ "$ACTIVATION_STARTED" -eq 1 ]; then
            echo "[DEPLOYMENT FAILED AFTER ACTIVATION] (Exit code: $exit_code)"
            if [ "$IN_ROLLBACK" -eq 1 ]; then
                echo "  [CRITICAL ALERT] Rollback procedure already attempted or aborted. Halting to prevent recursion."
                release_deployment_lock
                exit "$exit_code"
            fi
            IN_ROLLBACK=1
            echo "  ==> Initiating Automated Recovery to previous known-good release..."
            if [ -f "./scripts/rollback-production.sh" ]; then
                if ./scripts/rollback-production.sh; then
                    echo "  [AUTO-RECOVERY SUCCESSFUL] Production services safely restored to previous release (${CURRENT_COMMIT:-unknown})."
                    echo "  Deployment ended with failure status to prevent misleading reports."
                else
                    echo "  [CRITICAL ALERT] Automated recovery failed! Immediate manual recovery required."
                    echo "  Inspect PM2 logs with: pm2 logs"
                fi
            else
                echo "  [CRITICAL ALERT] scripts/rollback-production.sh not found! Immediate manual recovery required."
            fi
            rm -rf backend/dist.candidate frontend/.next.candidate backend/tsconfig.candidate.json
            rm -f .prev-deployed-commit
            echo "========================================================================="
            release_deployment_lock
            exit "$exit_code"
        else
            echo "[DEPLOYMENT FAILED BEFORE ACTIVATION] Cleaning temporary candidate build artifacts..."
            # Remove ONLY temporary candidate artifacts created during this failed run
            rm -rf backend/dist.candidate frontend/.next.candidate backend/tsconfig.candidate.json
            rm -rf backend/dist.prev.tmp frontend/.next.prev.tmp
            rm -rf backend/dist.prev.old frontend/.next.prev.old backend/dist.old frontend/.next.old
            # If candidate build failed before activation, return branch to pre-merge commit non-destructively
            if [ -n "${CURRENT_COMMIT:-}" ] && [ -n "${CURRENT_BRANCH:-}" ] && [ "$(git rev-parse HEAD 2>/dev/null)" != "$CURRENT_COMMIT" ]; then
                echo "  Candidate build not activated. Returning branch $CURRENT_BRANCH non-destructively to: $CURRENT_COMMIT"
                git checkout -B "$CURRENT_BRANCH" "$CURRENT_COMMIT" 2>/dev/null || {
                    echo "  [SAFETY NOTICE] Non-destructive checkout prevented overwriting working tree files."
                    echo "  Local files preserved. Current Git commit: $(git rev-parse HEAD 2>/dev/null)"
                }
            fi
            rm -f .prev-deployed-commit
            echo "========================================================================="
            release_deployment_lock
            exit "$exit_code"
        fi
    fi
    release_deployment_lock
}

handle_signal() {
    local sig="$1"
    RECEIVED_SIGNAL="$sig"
    case "$sig" in
        SIGHUP)  SIGNAL_EXIT_CODE=129 ;;
        SIGINT)  SIGNAL_EXIT_CODE=130 ;;
        SIGTERM) SIGNAL_EXIT_CODE=143 ;;
        *)       SIGNAL_EXIT_CODE=1 ;;
    esac
    echo ""
    echo "  [INTERRUPT] Received $sig signal. Terminating deployment safely..."
    exit "$SIGNAL_EXIT_CODE"
}

trap 'handle_signal SIGHUP' SIGHUP
trap 'handle_signal SIGINT' SIGINT
trap 'handle_signal SIGTERM' SIGTERM
trap cleanup_on_failure EXIT

echo "  User:       $(whoami)"
echo "  Directory:  $PROJECT_DIR"
echo "  Node:       $(node -v)"
echo "  npm:        $(npm -v)"

# Verify sufficient disk space for candidate compilation and snapshot preservation
# Defensible minimum floor: 1,572,864 KB (1,536 MB = 1.5 GB) accounting for backend dist (~3MB), Next.js candidate (~240MB),
# Webpack build cache (~400MB peak), active .prev snapshot (~240MB), and swap staging buffers (~240MB).
# Default safe threshold: 2,097,152 KB (2,048 MB = 2.0 GB) providing operational safety headroom for PM2 logs.
DEFAULT_DEPLOY_DISK_KB=2097152
MIN_DEPLOY_DISK_KB=1572864

if [ -n "${REQUIRED_DEPLOY_DISK_KB+x}" ] && [ -n "${REQUIRED_DEPLOY_DISK_KB:-}" ]; then
    # Validate that override is strictly a positive non-zero integer
    if ! [[ "$REQUIRED_DEPLOY_DISK_KB" =~ ^[0-9]+$ ]] || [ "$REQUIRED_DEPLOY_DISK_KB" -le 0 ]; then
        echo "  [CRITICAL ERROR] Invalid REQUIRED_DEPLOY_DISK_KB value: '${REQUIRED_DEPLOY_DISK_KB}'. Must be a positive integer in KB."
        exit 1
    fi
    # Enforce minimum defensible safety floor; reject unsafe lower overrides
    if [ "$REQUIRED_DEPLOY_DISK_KB" -lt "$MIN_DEPLOY_DISK_KB" ]; then
        echo "  [CRITICAL ERROR] Requested REQUIRED_DEPLOY_DISK_KB (${REQUIRED_DEPLOY_DISK_KB} KB / $(( REQUIRED_DEPLOY_DISK_KB / 1024 )) MB) is below the minimum safe threshold (${MIN_DEPLOY_DISK_KB} KB / $(( MIN_DEPLOY_DISK_KB / 1024 )) MB)."
        echo "  Reason: Candidate compilation, Next.js cache, and .prev snapshot staging require at least 1.5 GB concurrent disk space."
        echo "  Refusing to lower threshold below safety floor."
        exit 1
    fi
    EFFECTIVE_REQUIRED_DISK_KB="$REQUIRED_DEPLOY_DISK_KB"
else
    EFFECTIVE_REQUIRED_DISK_KB="$DEFAULT_DEPLOY_DISK_KB"
fi

if ! command -v df &> /dev/null; then
    echo "  [CRITICAL ERROR] 'df' utility not available. Cannot verify disk space. Failing closed to protect server state."
    exit 1
fi

FREE_KB=$(df -Pk "$PROJECT_DIR" 2>/dev/null | awk 'NR==2 {print $4}' || echo "")
if [ -z "$FREE_KB" ] || ! [[ "$FREE_KB" =~ ^[0-9]+$ ]]; then
    echo "  [CRITICAL ERROR] Failed to determine available disk space for '$PROJECT_DIR'. Failing closed to protect server state."
    exit 1
fi

AVAILABLE_MB=$(( FREE_KB / 1024 ))
REQUIRED_MB=$(( EFFECTIVE_REQUIRED_DISK_KB / 1024 ))

if [ "$FREE_KB" -lt "$EFFECTIVE_REQUIRED_DISK_KB" ]; then
    echo "  [CRITICAL ERROR] Insufficient disk space on $PROJECT_DIR to build and activate candidate release:"
    echo "    Available: ${AVAILABLE_MB} MB (${FREE_KB} KB)"
    echo "    Required:  ${REQUIRED_MB} MB (${EFFECTIVE_REQUIRED_DISK_KB} KB)"
    echo "  Deployment halted before building candidate release or modifying Git state."
    exit 1
fi

echo "  Disk Space: ${AVAILABLE_MB} MB available (${REQUIRED_MB} MB required)"
echo "  [NOTE] Disk preflight verified static threshold. Concurrent external server processes or logging may alter disk space during compilation."

# ------------------------------------------------------------------------------
# STEP 2: VERIFY GIT WORKING TREE & RELEASE TARGET
# ------------------------------------------------------------------------------
echo "==> Step 2: Verifying Git Working Tree & Release Target..."

if [ ! -d ".git" ]; then
    echo "  [CRITICAL ERROR] Not a git repository. Cannot safely verify release."
    exit 1
fi

# Verify expected branch is main or master
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || true)
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
    echo "  [CRITICAL ERROR] Expected branch 'main' or 'master', but currently on '$CURRENT_BRANCH'."
    echo "  Refusing deployment to prevent deploying unintended branches."
    exit 1
fi

# Refuse deployment if working tree contains any uncommitted changes (tracked or untracked)
if [ -n "$(git status --porcelain)" ]; then
    echo "  [CRITICAL ERROR] Dirty working tree detected! Uncommitted tracked or untracked changes exist:"
    git status --short
    echo "  Refusing deployment to protect server state. No files were discarded."
    exit 1
fi

CURRENT_COMMIT=$(git rev-parse HEAD)
git fetch origin "$CURRENT_BRANCH"
TARGET_COMMIT=$(git rev-parse "origin/$CURRENT_BRANCH")

if [ "$CURRENT_COMMIT" = "$TARGET_COMMIT" ]; then
    echo "  [NOTICE] Production is already running the latest commit ($CURRENT_COMMIT). Nothing to deploy."
    exit 0
fi

# Verify target commit can be fast-forwarded without discarding server changes
if ! git merge-base --is-ancestor HEAD "$TARGET_COMMIT"; then
    echo "  [CRITICAL ERROR] origin/$CURRENT_BRANCH has diverged from local branch HEAD!"
    echo "  Fast-forward update is impossible without manual review. Aborting without discarding local files."
    exit 1
fi

echo "  Current Deployed Commit: $CURRENT_COMMIT"
echo "  Target Release Commit:   $TARGET_COMMIT"

# Detect whether version-controlled database migrations are included in this release
MIGRATION_CHANGES=$(git diff --name-only "$CURRENT_COMMIT" "$TARGET_COMMIT" | grep -E '^backend/prisma/migrations/' || true)

# ------------------------------------------------------------------------------
# STEP 3: MIGRATION SAFETY LOCK
# ------------------------------------------------------------------------------
if [ -n "$MIGRATION_CHANGES" ]; then
    echo "========================================================================="
    echo "[CRITICAL SAFETY LOCK] Database migration files detected in release diff:"
    echo "$MIGRATION_CHANGES"
    echo ""
    echo "BLOCKED: Automatic production migrations are disabled."
    echo "Reason: The production database contains existing tables but has no"
    echo "        verified Prisma migration baseline in _prisma_migrations."
    echo "        ALLOW_PRODUCTION_MIGRATIONS=true alone is not proof of safety."
    echo ""
    echo "Executing 'prisma migrate deploy' without a verified baseline will cause"
    echo "fatal schema conflict errors and potential data loss."
    echo ""
    echo "Required procedure before migrations can be enabled in production:"
    echo "  1. Review and verify the migration SQL diff against current production schema."
    echo "  2. Establish and verify baseline in _prisma_migrations using:"
    echo "     npx prisma migrate resolve --applied <baseline_migration_name>"
    echo "  3. Execute reviewed migration with explicit manual authorization."
    echo "Deployment aborted before modifying Git HEAD or database."
    echo "========================================================================="
    exit 1
fi

echo "==> Step 3: Application-only release (No database migrations). Zero database commands will be executed."

# ------------------------------------------------------------------------------
# PRE-ACTIVATION COMMIT TRACKING
# ------------------------------------------------------------------------------

# Record previous commit for rollback tracking before merge
echo "$CURRENT_COMMIT" > .prev-deployed-commit

# Fast-forward working tree to target commit safely
git merge --ff-only "origin/$CURRENT_BRANCH"

# ------------------------------------------------------------------------------
# STEP 4: ISOLATED CANDIDATE BUILDS (Active PM2 artifacts completely untouched)
# ------------------------------------------------------------------------------
echo "==> Step 4: Compiling Backend Candidate Release (Isolated Build)..."

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

# Verify backend candidate build artifact entry point and root module exist
if [ ! -f "backend/dist.candidate/src/main.js" ] && [ ! -f "backend/dist.candidate/main.js" ]; then
    echo "  [CRITICAL ERROR] Backend candidate compilation did not produce expected entry point (src/main.js)!"
    rm -rf backend/dist.candidate
    exit 1
fi

if [ ! -f "backend/dist.candidate/src/app.module.js" ]; then
    echo "  [CRITICAL ERROR] Backend candidate compilation did not produce root module (src/app.module.js)!"
    rm -rf backend/dist.candidate
    exit 1
fi
echo "  [SUCCESS] Backend candidate release compiled and verified in dist.candidate."

echo "==> Step 5: Compiling Frontend Candidate Release (Isolated Build)..."
rm -rf frontend/.next.candidate
(cd frontend && NEXT_DIST_DIR=.next.candidate npm run build)

# Verify frontend candidate build artifact manifest, server bundle, and static assets exist
if [ ! -f "frontend/.next.candidate/BUILD_ID" ]; then
    echo "  [CRITICAL ERROR] Frontend candidate compilation did not produce valid BUILD_ID!"
    rm -rf frontend/.next.candidate
    exit 1
fi
CANDIDATE_BUILD_ID=$(cat "frontend/.next.candidate/BUILD_ID" 2>/dev/null || echo "")

if [ ! -d "frontend/.next.candidate/server" ] || [ ! -d "frontend/.next.candidate/static" ]; then
    echo "  [CRITICAL ERROR] Frontend candidate compilation is missing server or static assets!"
    rm -rf frontend/.next.candidate
    exit 1
fi
echo "  [SUCCESS] Frontend candidate release compiled and verified in .next.candidate (BUILD_ID: ${CANDIDATE_BUILD_ID:-unknown})."

# ------------------------------------------------------------------------------
# STEP 6: ATOMIC SNAPSHOT & ACTIVATION
# ------------------------------------------------------------------------------
echo "==> Step 6: Atomically Activating Verified Candidate Artifacts..."

# 1. Snapshot current active artifacts safely to .prev
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

# 2. Record release metadata before activation
mkdir -p .releases
cat << EOF > .releases/previous-release.json
{
  "commit": "$CURRENT_COMMIT",
  "timestamp": "$TIMESTAMP",
  "backend_artifact": "backend/dist.prev",
  "frontend_artifact": "frontend/.next.prev"
}
EOF

# 3. Atomically activate candidate artifacts into production paths
# Verify both candidate build directories exist immediately prior to activation
if [ ! -d "backend/dist.candidate" ] || [ ! -d "frontend/.next.candidate" ]; then
    echo "  [CRITICAL ERROR] Candidate build directories (backend/dist.candidate or frontend/.next.candidate) are missing immediately prior to activation!"
    exit 1
fi
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

echo "  [SUCCESS] Verified candidate artifacts activated in production paths."

# ------------------------------------------------------------------------------
# STEP 7: RELOAD PRODUCTION SERVICES (PM2 / Systemd)
# ------------------------------------------------------------------------------
echo "==> Step 7: Reloading Production Application Services..."

if command -v pm2 &> /dev/null; then
    echo "  Reloading PM2 process manager..."
    pm2 reload ecosystem.config.js || pm2 restart ecosystem.config.js
elif command -v systemctl &> /dev/null && systemctl is-active --quiet cmd-backend; then
    echo "  Restarting systemd service..."
    sudo systemctl restart cmd-backend cmd-frontend
else
    echo "  [NOTE] Service reload step executed."
fi

# ------------------------------------------------------------------------------
# STEP 8: AUTOMATED MULTI-POINT HEALTH VERIFICATION & RECOVERY
# ------------------------------------------------------------------------------
echo "==> Step 8: Performing Health Verification..."

# Reliable multi-tool HTTP probe helper: uses curl if available, falls back to node http
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
        return 2 # Code 2: Neither probe tool is available
    fi
}

PROBE_TOOL=""
if command -v curl &> /dev/null; then
    PROBE_TOOL="curl"
elif command -v node &> /dev/null; then
    PROBE_TOOL="node (http fallback)"
else
    echo "  [CRITICAL ERROR] Neither 'curl' nor 'node' executable is available for health verification."
    echo "  Failing closed to prevent unverified production deployment."
    exit 1
fi

echo "  Health probe tool: $PROBE_TOOL"

HEALTHY=false
for i in {1..5}; do
    echo "  Health check attempt $i of 5 (waiting 3s)..."
    sleep 3
    BACKEND_OK=false
    FRONTEND_OK=false

    if check_http_endpoint "http://127.0.0.1:4000/api/settings/public"; then
        BACKEND_OK=true
    fi
    if check_http_endpoint "http://127.0.0.1:3000/"; then
        # Release Identity Verification: ensure active Next.js process is serving the candidate build manifest
        if [ -n "${CANDIDATE_BUILD_ID:-}" ]; then
            if check_http_endpoint "http://127.0.0.1:3000/_next/static/${CANDIDATE_BUILD_ID}/_buildManifest.js"; then
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
    echo "  [SUCCESS] All application services are online and healthy!"
    echo "$TARGET_COMMIT" > .current-deployed-commit
    DEPLOY_SUCCESS=1
else
    echo "  [CRITICAL ERROR] Health check failed: Candidate release did not respond with 200 OK!"
    exit 1
fi

echo "======================================================================"
echo "[SUCCESS] Production Release $TARGET_COMMIT Deployed Successfully!"
echo "======================================================================"
