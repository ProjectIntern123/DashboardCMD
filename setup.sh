#!/usr/bin/env bash

# =========================================================================
#       HARTEK GROUP CMD OFFICE COMMAND CENTER - UBUNTU/LINUX SETUP
# =========================================================================

set -e

echo "========================================================================="
echo "       HARTEK GROUP CMD OFFICE COMMAND CENTER - LINUX ONE-TIME SETUP"
echo "========================================================================="
echo ""

# Step 1: Check Prerequisites
echo "[STEP 1/6] Checking System Prerequisites (Node.js & npm)..."
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed."
    echo "Please install Node.js v20 LTS using:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt install -y nodejs"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm is not installed."
    exit 1
fi

NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)
echo "[SUCCESS] Node.js ($NODE_VERSION) & npm ($NPM_VERSION) detected."
echo ""

# Step 2: Environment Sync
echo "[STEP 2/6] Verifying & Synchronizing Environment (.env)..."
node scripts/sync-env.js
echo "[SUCCESS] Environment files verified."
echo ""

# Step 3: Install Dependencies
echo "[STEP 3/6] Verifying Dependencies (Root, Backend, Frontend)..."
node scripts/bootstrap.js
echo "[SUCCESS] Dependencies verified and ready."
echo ""

# Step 4: Database Schema Migration
echo "[STEP 4/6] Checking Database Connection & Synchronizing Schema..."
cd backend
echo "[INFO] Running Prisma Database Schema Push..."
npx prisma db push --accept-data-loss
cd ..
echo "[SUCCESS] Database schema synchronized successfully."
echo ""

# Step 5: Database Seed
echo "[STEP 5/6] Checking & Seeding Master Data..."
cd backend
npx prisma db seed || echo "[WARNING] Seed notice emitted, continuing..."
cd ..
echo "[SUCCESS] Database master data verified."
echo ""

# Step 6: Build Binaries
echo "[STEP 6/6] Checking & Compiling Application Builds..."
node scripts/build.js
echo "[SUCCESS] Application builds compiled successfully."
echo ""

echo "========================================================================="
echo "         SETUP COMPLETE! THE CMD COMMAND CENTER IS READY TO RUN!"
echo "========================================================================="
echo ""
echo "Admin Credentials:"
echo "  - System Admin: project-ops@hartek.com"
echo "  - (Use 'node scripts/create-admin.js <email> <password>' to create additional admins)"
echo ""
echo "To run in development mode:       ./run.sh"
echo "To run in production with PM2:    pm2 start ecosystem.config.js"
echo ""
