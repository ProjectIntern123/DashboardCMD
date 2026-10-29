#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_SCRIPT="$SCRIPT_DIR/deploy-production.sh"

echo "========================================================================="
echo "   HARTEK CMD COMMAND CENTER — CANONICAL PRODUCTION DEPLOYMENT"
echo "   Forwarding execution to: scripts/deploy-production.sh"
echo "========================================================================="

if [ -f "$TARGET_SCRIPT" ]; then
    chmod +x "$TARGET_SCRIPT"
    exec "$TARGET_SCRIPT" "$@"
else
    echo "[CRITICAL ERROR] Canonical deployment script not found: $TARGET_SCRIPT"
    exit 1
fi
