#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Staging Health Verification Script
# Strictly validates staging health endpoints on loopback ports 4001 and 3001
# Never probes or alters production processes (ports 4000/3000)
# ==============================================================================
set -euo pipefail

EXPECTED_COMMIT="${1:-${EXPECTED_COMMIT:-${TARGET_COMMIT:-}}}"
BACKEND_SETTINGS_URL="http://127.0.0.1:4001/api/settings/public"
BACKEND_VERSION_URL="http://127.0.0.1:4001/api/version"
FRONTEND_URL="http://127.0.0.1:3001/"
MAX_ATTEMPTS=10
SLEEP_SECONDS=3
REQUIRED_CONSECUTIVE=2
CONSECUTIVE_SUCCESSES=0

echo "======================================================================"
echo "[HARTEK CMD] Staging Health & Configuration Verification"
echo "Target Backend Settings: $BACKEND_SETTINGS_URL"
echo "Target Backend Version:  $BACKEND_VERSION_URL"
echo "Target Frontend:         $FRONTEND_URL"
if [ -n "$EXPECTED_COMMIT" ]; then
    echo "Expected Release Commit: $EXPECTED_COMMIT"
else
    echo "Expected Release Commit: (not specified - release identity probe required)"
fi
echo "======================================================================"

# Fail closed if curl is not installed
if ! command -v curl &> /dev/null; then
    echo "  [CRITICAL ERROR] Required tool 'curl' is not installed."
    echo "  Staging health verification fails closed when verification tools are missing."
    exit 1
fi

# Function to check release identity with bounded timeouts and fail-closed JSON parsing
check_staging_release_identity() {
    local expected="$1"
    local probe_tmp="/tmp/probe_staging_version_$$.json"
    local match=1

    local http_code
    http_code=$(curl -s -o "$probe_tmp" -w "%{http_code}" --connect-timeout 5 --max-time 10 "$BACKEND_VERSION_URL" 2>/dev/null || echo "000")
    if [ "$http_code" = "200" ]; then
        if command -v node &> /dev/null; then
            if EXPECTED="$expected" node -e '
                try {
                    const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
                    const exp = (process.env.EXPECTED || "").trim();
                    if (d && typeof d === "object" && typeof d.commit === "string") {
                        const act = d.commit.trim();
                        if (act && act !== "unknown" && (!exp || act === exp)) {
                            process.exit(0);
                        }
                    }
                } catch(e) {}
                process.exit(1);
            ' "$probe_tmp" >/dev/null 2>&1; then
                match=0
            fi
        else
            if grep -q "\"commit\":[[:space:]]*\"$expected\"" "$probe_tmp" 2>/dev/null; then
                match=0
            fi
        fi
    fi
    rm -f "$probe_tmp"
    return "$match"
}

HEALTHY=false

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
    echo "==> Probe attempt $attempt of $MAX_ATTEMPTS (waiting ${SLEEP_SECONDS}s)..."
    sleep "$SLEEP_SECONDS"

    BACKEND_STATUS=0
    VERSION_STATUS=0
    FRONTEND_STATUS=0

    # 1. Probe Backend Public Settings endpoint (HTTP 200 expected)
    BACKEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$BACKEND_SETTINGS_URL" 2>/dev/null || echo "000")
    if [ "$BACKEND_CODE" = "200" ]; then
        BACKEND_STATUS=1
        echo "  [OK] Backend HTTP settings probe: Status $BACKEND_CODE"
    else
        echo "  [WAIT] Backend settings probe returned HTTP $BACKEND_CODE (waiting for service ready)"
    fi

    # 2. Probe Backend Version Release Identity endpoint
    if [ -n "$EXPECTED_COMMIT" ]; then
        if check_staging_release_identity "$EXPECTED_COMMIT"; then
            VERSION_STATUS=1
            echo "  [OK] Backend release identity verified: Commit matches $EXPECTED_COMMIT"
        else
            echo "  [WAIT] Backend release identity check failed or commit mismatch (expected: $EXPECTED_COMMIT)"
        fi
    else
        # If no expected commit passed, still verify endpoint returns HTTP 200 and a valid non-unknown commit
        if check_staging_release_identity ""; then
            VERSION_STATUS=1
            echo "  [OK] Backend release identity endpoint is healthy and returning valid commit"
        else
            echo "  [WAIT] Backend release identity check failed (HTTP 503 or malformed version manifest)"
        fi
    fi

    # 3. Probe Frontend root endpoint (HTTP 200, 302, 307 expected)
    FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$FRONTEND_URL" 2>/dev/null || echo "000")
    if [ "$FRONTEND_CODE" = "200" ] || [ "$FRONTEND_CODE" = "302" ] || [ "$FRONTEND_CODE" = "307" ]; then
        FRONTEND_STATUS=1
        echo "  [OK] Frontend HTTP probe: Status $FRONTEND_CODE"
    else
        echo "  [WAIT] Frontend probe returned HTTP $FRONTEND_CODE (waiting for service ready)"
    fi

    if [ "$BACKEND_STATUS" -eq 1 ] && [ "$VERSION_STATUS" -eq 1 ] && [ "$FRONTEND_STATUS" -eq 1 ]; then
        CONSECUTIVE_SUCCESSES=$((CONSECUTIVE_SUCCESSES + 1))
        echo "  [HEALTH PASS] Attempt $attempt passed verification (Consecutive: $CONSECUTIVE_SUCCESSES/$REQUIRED_CONSECUTIVE)."
        if [ "$CONSECUTIVE_SUCCESSES" -ge "$REQUIRED_CONSECUTIVE" ]; then
            HEALTHY=true
            break
        fi
    else
        if [ "$CONSECUTIVE_SUCCESSES" -gt 0 ]; then
            echo "  [HEALTH FLAP] Attempt $attempt failed after prior pass. Resetting consecutive counter to 0."
        fi
        CONSECUTIVE_SUCCESSES=0
    fi
done

echo "----------------------------------------------------------------------"
if [ "$HEALTHY" = true ]; then
    echo "[SUCCESS] Staging services are online and verified on release commit ${EXPECTED_COMMIT:-current}!"

    # Verify PM2 processes if PM2 is present
    if command -v pm2 &> /dev/null; then
        echo "==> Checking PM2 Staging Process Statuses..."
        pm2 describe cmd-staging-backend > /dev/null 2>&1 && echo "  [PM2] cmd-staging-backend: registered" || echo "  [PM2 NOTE] cmd-staging-backend not running under PM2"
        pm2 describe cmd-staging-frontend > /dev/null 2>&1 && echo "  [PM2] cmd-staging-frontend: registered" || echo "  [PM2 NOTE] cmd-staging-frontend not running under PM2"
    fi

    echo "======================================================================"
    exit 0
else
    echo "[CRITICAL ERROR] Staging health verification failed after $MAX_ATTEMPTS attempts!"
    echo "Backend settings response: HTTP $BACKEND_CODE"
    echo "Backend release identity:  Status $VERSION_STATUS (Expected: ${EXPECTED_COMMIT:-valid commit})"
    echo "Frontend response:         HTTP $FRONTEND_CODE"
    echo "Check staging logs in ./logs/staging-backend-error.log and ./logs/staging-frontend-error.log."
    echo "======================================================================"
    exit 1
fi
