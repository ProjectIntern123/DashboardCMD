#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Production Database & App Backup Script
# ==============================================================================
set -euo pipefail
umask 077

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
chmod 700 "$BACKUP_DIR" || {
    echo "  [CRITICAL ERROR] Failed to set secure permissions (700) on backup directory: $BACKUP_DIR! Aborting backup."
    exit 1
}

BACKUP_SUCCESS=0
cleanup_on_failure() {
    local exit_code=$?
    set +e
    if [ "$BACKUP_SUCCESS" -ne 1 ]; then
        echo "  [CLEANUP] Backup process did not complete successfully (exit code: $exit_code). Removing incomplete backup directory: $BACKUP_DIR"
        rm -rf "$BACKUP_DIR"
    fi
    exit "$exit_code"
}
trap cleanup_on_failure EXIT

echo "======================================================================"
echo "[BACKUP STARTED] Timestamp: $TIMESTAMP"
echo "[BACKUP LOCATION] $BACKUP_DIR"
echo "======================================================================"

# ------------------------------------------------------------------------------
# 1. DATABASE BACKUP (PostgreSQL pg_dump)
# ------------------------------------------------------------------------------
echo "==> Step 1: Detecting Database Configuration..."

# Check free disk space before dumping (configurable via REQUIRED_BACKUP_DISK_KB, default 1GB)
REQUIRED_DISK_KB="${REQUIRED_BACKUP_DISK_KB:-1048576}"
if command -v df &> /dev/null; then
    FREE_KB=$(df -k "$BACKUP_BASE" 2>/dev/null | awk 'NR==2 {print $4}' || echo "")
    if [ -n "$FREE_KB" ] && [ "$FREE_KB" -lt "$REQUIRED_DISK_KB" ]; then
        echo "  [CRITICAL ERROR] Insufficient disk space on $BACKUP_BASE (available: ${FREE_KB}KB, required: ${REQUIRED_DISK_KB}KB). Aborting backup."
        exit 1
    fi
fi

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

# Temporarily disable set -e to capture pipeline exit statuses immediately via PIPESTATUS
set +e
if [ -n "${DATABASE_URL:-}" ]; then
    echo "  Executing pg_dump against production PostgreSQL database..."
    # Strip Prisma-specific ?schema= or &schema= parameters unsupported by pg_dump CLI
    CLEAN_DB_URL=$(echo "$DATABASE_URL" | sed -E 's/[?&]schema=[^&]*//g' | sed -E 's/\?$//')
    pg_dump "$CLEAN_DB_URL" | gzip > "$DB_BACKUP_FILE"
    PIPE_STATUSES=("${PIPESTATUS[@]}")
else
    echo "  [WARN] DATABASE_URL not set in environment. Attempting local PostgreSQL dump..."
    pg_dump -U postgres -h localhost cmd_office | gzip > "$DB_BACKUP_FILE"
    PIPE_STATUSES=("${PIPESTATUS[@]}")
fi
PG_STATUS="${PIPE_STATUSES[0]}"
GZIP_STATUS="${PIPE_STATUSES[1]}"
set -e

# Verify pg_dump and gzip pipeline exit statuses
if [ "$PG_STATUS" -ne 0 ] || [ "$GZIP_STATUS" -ne 0 ]; then
    echo "  [CRITICAL ERROR] Database dump pipeline failed: pg_dump exited with $PG_STATUS, gzip exited with $GZIP_STATUS!"
    rm -f "$DB_BACKUP_FILE"
    exit 1
fi

# Verify DB Backup non-empty file and gzip integrity
if [ ! -s "$DB_BACKUP_FILE" ]; then
    echo "  [CRITICAL ERROR] Database backup file is missing or 0 bytes!"
    rm -f "$DB_BACKUP_FILE"
    exit 1
fi

if ! gzip -t "$DB_BACKUP_FILE" 2>/dev/null; then
    echo "  [CRITICAL ERROR] Database backup file is corrupted gzip archive!"
    rm -f "$DB_BACKUP_FILE"
    exit 1
fi

# Verify PostgreSQL dump completion marker to detect truncated dumps (using gzip -dc for portable decompression)
if ! gzip -dc "$DB_BACKUP_FILE" 2>/dev/null | tail -n 25 | grep -q "PostgreSQL database dump complete"; then
    echo "  [CRITICAL ERROR] Backup verification failed: Truncated dump (PostgreSQL completion marker missing)!"
    rm -f "$DB_BACKUP_FILE"
    exit 1
fi

DB_SIZE=$(du -h "$DB_BACKUP_FILE" | cut -f1)
echo "  [SUCCESS] Database backup created and verified: $DB_BACKUP_FILE ($DB_SIZE)"

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

# ------------------------------------------------------------------------------
# 3. CONSERVATIVE RETENTION CLEANUP
# ------------------------------------------------------------------------------
# Keep at least MIN_KEEP_BACKUPS (default: 5) and never remove the only usable backup
MIN_KEEP_BACKUPS=5
mapfile -t ALL_BACKUPS < <(find "$BACKUP_BASE" -maxdepth 1 -type d -name "backup-*" 2>/dev/null | sort)
TOTAL_BACKUPS="${#ALL_BACKUPS[@]}"

if [ "$TOTAL_BACKUPS" -gt "$MIN_KEEP_BACKUPS" ]; then
    MAX_PRUNE=$(( TOTAL_BACKUPS - MIN_KEEP_BACKUPS ))
    mapfile -t OLD_BACKUPS < <(find "$BACKUP_BASE" -maxdepth 1 -type d -name "backup-*" -mtime +14 2>/dev/null | sort)
    PRUNED_COUNT=0
    for old_dir in "${OLD_BACKUPS[@]}"; do
        if [ -z "$old_dir" ] || [ "$PRUNED_COUNT" -ge "$MAX_PRUNE" ]; then
            break
        fi
        if [ -d "$old_dir" ] && [[ "$old_dir" == "$BACKUP_BASE"/backup-* ]]; then
            echo "  [PRUNING] Removing aged backup archive: $old_dir"
            rm -rf "$old_dir"
            PRUNED_COUNT=$(( PRUNED_COUNT + 1 ))
        fi
    done
else
    echo "  [RETENTION] $TOTAL_BACKUPS backup(s) on disk. Within minimum retention threshold ($MIN_KEEP_BACKUPS). Skipping pruning."
fi

BACKUP_SUCCESS=1

echo "======================================================================"
echo "[BACKUP COMPLETE & VERIFIED SUCCESSFULLY]"
echo "  Backup Folder: $BACKUP_DIR"
echo "  DB Archive:    $DB_BACKUP_FILE"
echo "  App Archive:   $APP_BACKUP_FILE"
echo "======================================================================"
