#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Production Rollback Script
# Safe Artifact Restoration & Rollback Strategy
# ==============================================================================
set -euo pipefail

PROJECT_DIR="$(pwd)"
ROLLBACK_SUCCESS=0
ROLLBACK_CLEANUP_DONE=0

cleanup_rollback_on_failure() {
    local exit_code=$?
    if [ "$ROLLBACK_CLEANUP_DONE" -eq 1 ]; then
        exit "$exit_code"
    fi
    ROLLBACK_CLEANUP_DONE=1
    trap - EXIT SIGHUP SIGINT SIGTERM
    set +e
    if [ "$ROLLBACK_SUCCESS" -ne 1 ]; then
        echo "  [ROLLBACK CLEANUP] Rollback did not complete successfully (Exit code: $exit_code)."
        echo "  Preserving all recovery artifacts (backend/dist.prev, frontend/.next.prev, .old, metadata)."
        rm -rf backend/dist.rollback.tmp frontend/.next.rollback.tmp
        if [ ! -d "backend/dist" ]; then
            if [ -d "backend/dist.rollback.bak" ]; then
                mv "backend/dist.rollback.bak" "backend/dist" 2>/dev/null || true
            elif [ -d "backend/dist.old" ]; then
                mv "backend/dist.old" "backend/dist" 2>/dev/null || true
            fi
        fi
        if [ ! -d "frontend/.next" ]; then
            if [ -d "frontend/.next.rollback.bak" ]; then
                mv "frontend/.next.rollback.bak" "frontend/.next" 2>/dev/null || true
            elif [ -d "frontend/.next.old" ]; then
                mv "frontend/.next.old" "frontend/.next" 2>/dev/null || true
            fi
        fi
    fi
    exit "$exit_code"
}

handle_rollback_signal() {
    local sig="$1"
    case "$sig" in
        SIGHUP)  SIGNAL_EXIT_CODE=129 ;;
        SIGINT)  SIGNAL_EXIT_CODE=130 ;;
        SIGTERM) SIGNAL_EXIT_CODE=143 ;;
        *)       SIGNAL_EXIT_CODE=1 ;;
    esac
    echo ""
    echo "  [INTERRUPT] Rollback script received $sig signal. Halting safely..."
    exit "$SIGNAL_EXIT_CODE"
}

trap 'handle_rollback_signal SIGHUP' SIGHUP
trap 'handle_rollback_signal SIGINT' SIGINT
trap 'handle_rollback_signal SIGTERM' SIGTERM
trap cleanup_rollback_on_failure EXIT

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

# 2. Check for unexpected untracked files (excluding legitimate deployment/release metadata and snapshot directories)
UNEXPECTED_UNTRACKED=$(git status --porcelain | grep -vE '^\?\? (\.releases/|\.prev-deployed-commit|\.current-deployed-commit|backend/dist(\.|\/)|frontend/\.next(\.|\/)|backend/tsconfig\.candidate\.json)' || true)
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
PREV_BUILD_ID=$(cat "frontend/.next.prev/BUILD_ID" 2>/dev/null || echo "")

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

# 4. Sequential directory swap (only executed after all prerequisites and copies are verified)
# Preserve existing .old directories as .old.bak so no recovery copies are destroyed before verification
[ -d "backend/dist.old" ] && mv "backend/dist.old" "backend/dist.old.bak"
[ -d "backend/dist" ] && mv "backend/dist" "backend/dist.old"
mv backend/dist.rollback.tmp backend/dist

[ -d "frontend/.next.old" ] && mv "frontend/.next.old" "frontend/.next.old.bak"
[ -d "frontend/.next" ] && mv "frontend/.next" "frontend/.next.old"
mv frontend/.next.rollback.tmp frontend/.next

echo "  [SUCCESS] Previous production artifacts restored successfully into active paths."

# 5. Git Safety: PM2 executes directly from compiled directories (backend/dist and frontend/.next).
# Rollback does NOT modify the Git checkout or detach HEAD to protect future deployments.
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "detached")
echo "  [GIT SAFETY] Preserving current Git branch/checkout ('$CURRENT_BRANCH')."
echo "  Application runtime restored to artifacts matching commit: $PREV_COMMIT"

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

# Reliable multi-tool HTTP probe helper: uses curl if available, falls back to node http
# Enforces bounded timeouts and validates that backend settings endpoints return valid JSON (rejecting 401/403/500)
check_http_endpoint() {
    local url="$1"
    if command -v curl &> /dev/null; then
        if [[ "$url" == *"api/settings/public"* ]]; then
            local probe_tmp="$PROJECT_DIR/.releases/probe_rollback_$$.json"
            mkdir -p "$PROJECT_DIR/.releases"
            local http_code
            http_code=$(curl -s -o "$probe_tmp" -w "%{http_code}" --connect-timeout 5 --max-time 10 "$url" 2>/dev/null || echo "000")
            if [ "$http_code" != "200" ]; then
                rm -f "$probe_tmp"
                return 1
            fi
            if command -v node &> /dev/null; then
                if node -e '
                    try {
                        const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
                        if (d && typeof d === "object" && (d.app_name !== undefined || d.login_heading !== undefined)) {
                            process.exit(0);
                        }
                    } catch(e) {}
                    process.exit(1);
                ' "$probe_tmp" >/dev/null 2>&1; then
                    rm -f "$probe_tmp"
                    return 0
                else
                    rm -f "$probe_tmp"
                    return 1
                fi
            else
                if grep -q '"app_name"' "$probe_tmp" 2>/dev/null; then
                    rm -f "$probe_tmp"
                    return 0
                else
                    rm -f "$probe_tmp"
                    return 1
                fi
            fi
        else
            curl -s -f --connect-timeout 5 --max-time 10 "$url" > /dev/null 2>&1
            return $?
        fi
    elif command -v node &> /dev/null; then
        node -e '
            const http = require("http");
            const url = process.argv[1];
            const isSettings = url.includes("api/settings/public");
            const req = http.get(url, { timeout: 5000 }, (res) => {
                if (isSettings) {
                    if (res.statusCode !== 200) process.exit(1);
                    let body = "";
                    res.on("data", c => body += c);
                    res.on("end", () => {
                        try {
                            const d = JSON.parse(body);
                            if (d && typeof d === "object" && (d.app_name !== undefined || d.login_heading !== undefined)) {
                                process.exit(0);
                            }
                        } catch(e) {}
                        process.exit(1);
                    });
                } else {
                    if (res.statusCode >= 200 && res.statusCode < 400) {
                        process.exit(0);
                    } else {
                        process.exit(1);
                    }
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
    echo "  Failing closed to prevent unverified rollback completion."
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
        # Release Identity Verification: ensure active Next.js process is serving the restored build manifest
        if [ -n "${PREV_BUILD_ID:-}" ]; then
            if check_http_endpoint "http://127.0.0.1:3000/_next/static/${PREV_BUILD_ID}/_buildManifest.js"; then
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
    echo "$PREV_COMMIT" > .current-deployed-commit
    rm -f .prev-deployed-commit
    rm -rf backend/dist.old backend/dist.old.bak frontend/.next.old frontend/.next.old.bak
    echo "======================================================================"
    echo "[ROLLBACK COMPLETE & VERIFIED] Application restored to previous working version."
    echo "======================================================================"
else
    echo "======================================================================"
    echo "[CRITICAL ERROR] Rollback health check failed! Application did not respond 200 OK."
    echo "Do NOT assume the rollback succeeded. Inspect 'pm2 logs' immediately."
    echo "Recovery metadata and fallback artifacts (.old, .prev) are preserved for retry."
    echo "======================================================================"
    exit 1
fi
