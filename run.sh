#!/usr/bin/env bash

# =========================================================================
#       HARTEK GROUP CMD OFFICE COMMAND CENTER - LINUX LAUNCHER
# =========================================================================

set -e

echo "========================================================================="
echo "       HARTEK GROUP CMD OFFICE COMMAND CENTER - APPLICATION LAUNCHER"
echo "========================================================================="
echo ""

if [ ! -f ".env" ]; then
    echo "[WARNING] .env file not found. Synchronizing from .env.example..."
    node scripts/sync-env.js
fi

echo "Starting Backend API Server (Port 4000) and Frontend Application (Port 3000)..."
echo ""
echo "Access URLs:"
echo "  - Web Dashboard: http://localhost:3000"
echo "  - Backend API:   http://localhost:4000/api"
echo ""
echo "Press Ctrl+C at any time to shut down both servers."
echo "========================================================================="
echo ""

npm run dev
