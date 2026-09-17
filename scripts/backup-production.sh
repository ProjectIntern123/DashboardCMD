#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Production Database & App Backup Script
# ==============================================================================
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
DEFAULT_BACKUP_BASE="/var/backups/cmd-dashboard"

# Fallback to user home directory if /var/backups is not writable
if [ -w "/var/backups" ] || [ "$EUID" -eq 0 ]; then
    BACKUP_BASE="$DEFAULT_BACKUP_BASE"
else
    BACKUP_BASE="$HOME/backups/cmd-dashboard"
fi

BACKUP_DIR="$BACKUP_BASE/backup-$TIMESTAMP"
mkdir -p "$BACKUP_DIR"

echo "======================================================================"
echo "[BACKUP STARTED] Timestamp: $TIMESTAMP"
echo "[BACKUP LOCATION] $BACKUP_DIR"
echo "======================================================================"

# ------------------------------------------------------------------------------
# 1. DATABASE BACKUP (PostgreSQL pg_dump)
# ------------------------------------------------------------------------------
echo "==> Step 1: Detecting Database Configuration..."

# Locate .env file
ENV_FILE=""
if [ -f "backend/.env" ]; then
    ENV_FILE="backend/.env"
elif [ -f ".env" ]; then
    ENV_FILE=".env"
fi

if [ -n "$ENV_FILE" ]; then
    echo "  Loading configuration from $ENV_FILE..."
    # Extract DATABASE_URL without printing credentials
    DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
fi

DB_BACKUP_FILE="$BACKUP_DIR/db-backup-$TIMESTAMP.sql.gz"

if [ -n "${DATABASE_URL:-}" ]; then
    echo "  Executing pg_dump against production PostgreSQL database..."
    pg_dump "$DATABASE_URL" | gzip > "$DB_BACKUP_FILE"
else
    echo "  [WARN] DATABASE_URL not set in environment. Attempting local PostgreSQL dump..."
    pg_dump -U postgres -h localhost cmd_office | gzip > "$DB_BACKUP_FILE"
fi

# Verify DB Backup non-empty file
if [ -s "$DB_BACKUP_FILE" ]; then
    DB_SIZE=$(du -h "$DB_BACKUP_FILE" | cut -f1)
    echo "  [SUCCESS] Database backup created: $DB_BACKUP_FILE ($DB_SIZE)"
else
    echo "  [CRITICAL ERROR] Database backup file is missing or 0 bytes!"
    exit 1
fi

# ------------------------------------------------------------------------------
# 2. APPLICATION SOURCE CODE & CONFIG BACKUP
# ------------------------------------------------------------------------------
echo "==> Step 2: Creating Application Snapshot..."

APP_BACKUP_FILE="$BACKUP_DIR/app-source-$TIMESTAMP.tar.gz"

tar --exclude='./node_modules' \
    --exclude='./backend/node_modules' \
    --exclude='./frontend/node_modules' \
    --exclude='./frontend/.next' \
    --exclude='./backend/dist' \
    --exclude='./.git' \
    --exclude='./backups' \
    --exclude='./*.log' \
    -czf "$APP_BACKUP_FILE" .

if [ -s "$APP_BACKUP_FILE" ]; then
    APP_SIZE=$(du -h "$APP_BACKUP_FILE" | cut -f1)
    echo "  [SUCCESS] Application snapshot created: $APP_BACKUP_FILE ($APP_SIZE)"
else
    echo "  [CRITICAL ERROR] Application backup tarball is missing or 0 bytes!"
    exit 1
fi

echo "======================================================================"
echo "[BACKUP COMPLETE & VERIFIED SUCCESSFULLY]"
echo "  Backup Folder: $BACKUP_DIR"
echo "  DB Archive:    $DB_BACKUP_FILE"
echo "  App Archive:   $APP_BACKUP_FILE"
echo "======================================================================"
