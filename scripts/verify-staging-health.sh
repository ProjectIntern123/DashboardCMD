#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Staging Health Verification Script
# Strictly validates staging health endpoints on loopback ports 4001 and 3001
# Never probes or alters production processes (ports 4000/3000)
# ==============================================================================
set -euo pipefail

BACKEND_URL="http://127.0.0.1:4001/api/settings/public"
FRONTEND_URL="http://127.0.0.1:3001/"
MAX_ATTEMPTS=10
SLEEP_SECONDS=3

echo "======================================================================"
echo "[HARTEK CMD] Staging Health & Configuration Verification"
echo "Target Backend:  $BACKEND_URL"
echo "Target Frontend: $FRONTEND_URL"
echo "======================================================================"

# Fail closed if curl is not installed
if ! command -v curl &> /dev/null; then
    echo "  [CRITICAL ERROR] Required tool 'curl' is not installed."
    echo "  Staging health verification fails closed when verification tools are missing."
    exit 1
fi

HEALTHY=false

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
    echo "==> Probe attempt $attempt of $MAX_ATTEMPTS (waiting ${SLEEP_SECONDS}s)..."
    sleep "$SLEEP_SECONDS"

    BACKEND_STATUS=0
    FRONTEND_STATUS=0

    # Probe Backend Public Settings endpoint (HTTP 200 expected)
    BACKEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$BACKEND_URL" 2>/dev/null || echo "000")
    if [ "$BACKEND_CODE" = "200" ]; then
        BACKEND_STATUS=1
        echo "  [OK] Backend HTTP probe: Status $BACKEND_CODE"
    else
        echo "  [WAIT] Backend probe returned HTTP $BACKEND_CODE (waiting for service ready)"
    fi

    # Probe Frontend root endpoint (HTTP 200, 302, 307 expected)
    FRONTEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$FRONTEND_URL" 2>/dev/null || echo "000")
    if [ "$FRONTEND_CODE" = "200" ] || [ "$FRONTEND_CODE" = "302" ] || [ "$FRONTEND_CODE" = "307" ]; then
        FRONTEND_STATUS=1
        echo "  [OK] Frontend HTTP probe: Status $FRONTEND_CODE"
    else
        echo "  [WAIT] Frontend probe returned HTTP $FRONTEND_CODE (waiting for service ready)"
    fi

    if [ "$BACKEND_STATUS" -eq 1 ] && [ "$FRONTEND_STATUS" -eq 1 ]; then
        HEALTHY=true
        break
    fi
done

echo "----------------------------------------------------------------------"
if [ "$HEALTHY" = true ]; then
    echo "[SUCCESS] Staging services are online and responding normally!"

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
    echo "Backend response:  HTTP $BACKEND_CODE"
    echo "Frontend response: HTTP $FRONTEND_CODE"
    echo "Check staging logs in ./logs/staging-backend-error.log and ./logs/staging-frontend-error.log."
    echo "======================================================================"
    exit 1
fi
