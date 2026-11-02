#!/usr/bin/env bash
# ==============================================================================
# HARTEK CMD Office Command Center - Isolated Staging Database Restore Drill
# Non-Destructive PostgreSQL Custom-Format Archive Verification
# Zero production access, zero production database modification
# ==============================================================================
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
PROJECT_DIR="$(pwd)"
LOG_DIR="$PROJECT_DIR/.releases"
mkdir -p "$LOG_DIR"
RESULT_LOG="$LOG_DIR/restore-drill-$TIMESTAMP.json"

echo "======================================================================"
echo "[HARTEK CMD] Isolated Staging Database Restoration Drill"
echo "Timestamp: $TIMESTAMP"
echo "Log File:  $RESULT_LOG"
echo "======================================================================"

# ------------------------------------------------------------------------------
# STEP 1: ISOLATED STAGING TARGET IDENTIFICATION & SAFETY ASSERTIONS
# ------------------------------------------------------------------------------
echo "==> Step 1: Positively Identifying Isolated Staging Instance..."

# 1. Affirmative Environment Flag Guard
if [ "${CONFIRM_ISOLATED_STAGING_ENVIRONMENT:-false}" != "true" ]; then
    echo "  [CRITICAL ERROR] Restoration drill refused! Explicit authorization required." >&2
    echo "  You must set: export CONFIRM_ISOLATED_STAGING_ENVIRONMENT=true" >&2
    echo "  This runbook must NEVER be executed against production." >&2
    exit 1
fi

# 2. Hostname Negative Guard (Reject known production host identifiers)
CURRENT_HOSTNAME=$(hostname 2>/dev/null || echo "unknown")
LOWER_HOSTNAME=$(echo "$CURRENT_HOSTNAME" | tr '[:upper:]' '[:lower:]')
if [[ "$LOWER_HOSTNAME" =~ (prod|production|hartek-cmd-prod|cmd-office-prod) ]]; then
    echo "  [CRITICAL ERROR] Hostname '$CURRENT_HOSTNAME' matches production pattern! Aborting drill." >&2
    exit 1
fi

# 3. Connection Parameters (Explicit staging settings only)
# Sanitize environment variables that could redirect or alter connection targets
unset PGSERVICE PGSERVICEFILE DATABASE_URL

STAGING_PG_HOST="${STAGING_PG_HOST:-127.0.0.1}"
STAGING_PG_PORT="${STAGING_PG_PORT:-5433}" # Default dedicated staging PostgreSQL port
STAGING_PG_USER="${STAGING_PG_USER:-cmd_staging}" # Dedicated non-superuser staging role

# Disallow default production port 5432 on localhost unless explicitly confirmed as isolated container
if [ "$STAGING_PG_HOST" = "127.0.0.1" ] || [ "$STAGING_PG_HOST" = "localhost" ]; then
    if [ "$STAGING_PG_PORT" = "5432" ] && [ "${ALLOW_STAGING_ON_PORT_5432:-false}" != "true" ]; then
        echo "  [CRITICAL ERROR] Port 5432 on localhost is the default production PostgreSQL port!" >&2
        echo "  A dedicated staging port (e.g. 5433) is required to guarantee isolation." >&2
        echo "  Override only with ALLOW_STAGING_ON_PORT_5432=true in confirmed isolated container environments." >&2
        exit 1
    fi
fi

# Baseline defense-in-depth: Prohibit default superuser account names
LOWER_PG_USER=$(echo "$STAGING_PG_USER" | tr '[:upper:]' '[:lower:]')
case "$LOWER_PG_USER" in
    postgres|root|admin|superuser)
        if [ "${ALLOW_SUPERUSER_DRILL:-false}" != "true" ]; then
            echo "  [CRITICAL ERROR] Target user '$STAGING_PG_USER' matches a privileged superuser name!" >&2
            echo "  A dedicated non-superuser staging account (e.g. 'cmd_staging') is required." >&2
            exit 1
        fi
        ;;
esac

# 4. Probe target PostgreSQL instance connectivity
echo "  Probing target instance at $STAGING_PG_HOST:$STAGING_PG_PORT (User: $STAGING_PG_USER)..."
PROBE_QUERY="SELECT inet_server_addr(), current_setting('port'), current_database();"
if ! PGPASSWORD="${STAGING_PG_PASSWORD:-}" psql -h "$STAGING_PG_HOST" -p "$STAGING_PG_PORT" -U "$STAGING_PG_USER" -d postgres -t -A -c "$PROBE_QUERY" > /dev/null 2>&1; then
    echo "  [CRITICAL ERROR] Cannot connect to isolated staging PostgreSQL instance at $STAGING_PG_HOST:$STAGING_PG_PORT!" >&2
    echo "  Failing closed to prevent restore against unverified target." >&2
    exit 1
fi

# 5. Query and verify active role privileges from PostgreSQL catalog
echo "  Verifying database privileges for role '$STAGING_PG_USER' in PostgreSQL catalog..."
PRIV_QUERY="SELECT current_setting('is_superuser') || '|' || coalesce((SELECT rolcreatedb::text FROM pg_roles WHERE rolname = current_user), 'f');"
ROLE_PRIVS=$(PGPASSWORD="${STAGING_PG_PASSWORD:-}" psql -h "$STAGING_PG_HOST" -p "$STAGING_PG_PORT" -U "$STAGING_PG_USER" -d postgres -t -A -c "$PRIV_QUERY" 2>/dev/null || echo "QUERY_FAILED")

if [ -z "$ROLE_PRIVS" ] || [[ ! "$ROLE_PRIVS" =~ ^(on|off)\|(true|false|t|f)$ ]]; then
    echo "  [CRITICAL ERROR] Failed to query or parse role privileges from PostgreSQL catalog (Result: '$ROLE_PRIVS')!" >&2
    echo "  Failing closed to prevent restore against an unverified privilege state." >&2
    exit 1
fi

IS_SUPER=$(echo "$ROLE_PRIVS" | cut -d '|' -f1)
HAS_CREATEDB_RAW=$(echo "$ROLE_PRIVS" | cut -d '|' -f2)

HAS_CREATEDB="f"
if [ "$HAS_CREATEDB_RAW" = "t" ] || [ "$HAS_CREATEDB_RAW" = "true" ]; then
    HAS_CREATEDB="t"
fi

if [ "$IS_SUPER" = "on" ]; then
    if [ "${ALLOW_SUPERUSER_DRILL:-false}" != "true" ]; then
        echo "  [CRITICAL ERROR] Target role '$STAGING_PG_USER' possesses active SUPERUSER privileges in PostgreSQL!" >&2
        echo "  A dedicated non-superuser staging role is required to prevent accidental production impact." >&2
        echo "  Override only with explicit ALLOW_SUPERUSER_DRILL=true in confirmed isolated container environments." >&2
        exit 1
    else
        echo "  [WARN] Target role possesses SUPERUSER privileges, allowed via explicit ALLOW_SUPERUSER_DRILL=true override."
    fi
fi

if [ "$HAS_CREATEDB" != "t" ]; then
    echo "  [CRITICAL ERROR] Target role '$STAGING_PG_USER' lacks the CREATEDB privilege!" >&2
    echo "  The restoration drill requires CREATEDB to create and drop ephemeral scratch databases." >&2
    echo "  Grant CREATEDB to '$STAGING_PG_USER' on the staging instance before running the drill." >&2
    exit 1
fi

echo "  [OK] Role privileges verified: non-superuser with CREATEDB permission."

# 6. Assert production database 'cmd_office' does NOT exist on the target instance
PROD_DB_COUNT=$(PGPASSWORD="${STAGING_PG_PASSWORD:-}" psql -h "$STAGING_PG_HOST" -p "$STAGING_PG_PORT" -U "$STAGING_PG_USER" -d postgres -t -A -c "SELECT COUNT(*) FROM pg_database WHERE datname='cmd_office';" 2>/dev/null || echo "1")
if [ "$PROD_DB_COUNT" -ne 0 ]; then
    echo "  [CRITICAL ISOLATION BREACH REJECTED] Production database 'cmd_office' was detected on target instance ($STAGING_PG_HOST:$STAGING_PG_PORT)!" >&2
    echo "  Refusing execution to prevent any proximity to production data." >&2
    exit 1
fi

echo "  [SUCCESS] Target positively verified as isolated staging PostgreSQL instance."

# ------------------------------------------------------------------------------
# STEP 2: BACKUP ARCHIVE VERIFICATION & CHECKSUM
# ------------------------------------------------------------------------------
echo "==> Step 2: Validating Backup Archive & Integrity..."

BACKUP_ARCHIVE="${1:-}"
if [ -z "$BACKUP_ARCHIVE" ] || [ ! -f "$BACKUP_ARCHIVE" ] || [ ! -s "$BACKUP_ARCHIVE" ]; then
    echo "  [CRITICAL ERROR] Backup archive file is missing or 0 bytes!" >&2
    echo "  Usage: $0 <path-to-backup-archive.dump|.sql.gz>" >&2
    exit 1
fi

ARCHIVE_BYTES=$(wc -c < "$BACKUP_ARCHIVE" | tr -d ' ')
echo "  Archive Path: $BACKUP_ARCHIVE ($ARCHIVE_BYTES bytes)"

# Calculate SHA-256 Checksum
BACKUP_CHECKSUM=""
if command -v sha256sum &> /dev/null; then
    BACKUP_CHECKSUM=$(sha256sum "$BACKUP_ARCHIVE" | awk '{print $1}')
elif command -v shasum &> /dev/null; then
    BACKUP_CHECKSUM=$(shasum -a 256 "$BACKUP_ARCHIVE" | awk '{print $1}')
else
    BACKUP_CHECKSUM="checksum-tool-unavailable"
fi
echo "  Archive SHA-256: $BACKUP_CHECKSUM"

# Format Detection via Magic Bytes
ARCHIVE_FORMAT="UNKNOWN"
MAGIC_BYTES=$(head -c 5 "$BACKUP_ARCHIVE" 2>/dev/null || echo "")

if [[ "$MAGIC_BYTES" == "PGDMP"* ]]; then
    ARCHIVE_FORMAT="PG_CUSTOM_DUMP"
    echo "  Detected Format: PostgreSQL Custom Archive (pg_dump -Fc)"
    if ! command -v pg_restore &> /dev/null; then
        echo "  [CRITICAL ERROR] 'pg_restore' executable is not installed or not in PATH!" >&2
        exit 1
    fi
    if ! pg_restore -l "$BACKUP_ARCHIVE" > /dev/null 2>&1; then
        echo "  [CRITICAL ERROR] Archive container validation failed: Corrupted or unreadable custom dump TOC!" >&2
        exit 1
    fi
    echo "  [OK] Custom dump Table of Contents verified readable."
elif gzip -t "$BACKUP_ARCHIVE" 2>/dev/null; then
    ARCHIVE_FORMAT="GZIP_SQL"
    echo "  Detected Format: Plain-text SQL Gzip Archive (pg_dump | gzip)"
    if ! gzip -dc "$BACKUP_ARCHIVE" | tail -n 25 | grep -q "PostgreSQL database dump complete"; then
        echo "  [CRITICAL ERROR] Archive validation failed: Truncated dump (missing PostgreSQL completion marker)!" >&2
        exit 1
    fi
    echo "  [OK] Gzip CRC integrity and PostgreSQL completion marker present."
else
    echo "  [CRITICAL ERROR] Unrecognized or corrupted archive format in '$BACKUP_ARCHIVE'!" >&2
    exit 1
fi

# ------------------------------------------------------------------------------
# STEP 3: DISK SPACE & POSTGRESQL VERSION PREFLIGHT
# ------------------------------------------------------------------------------
echo "==> Step 3: Checking Staging Disk Space & PostgreSQL Version..."

ARCHIVE_SIZE_KB=$(( ARCHIVE_BYTES / 1024 ))
REQUIRED_DISK_KB=$(( ARCHIVE_SIZE_KB * 5 ))
[ "$REQUIRED_DISK_KB" -lt 2097152 ] && REQUIRED_DISK_KB=2097152 # Minimum 2.0 GB

if command -v df &> /dev/null; then
    FREE_DISK_KB=$(df -k "$PROJECT_DIR" 2>/dev/null | awk 'NR==2 {print $4}' || echo "")
    if [ -n "$FREE_DISK_KB" ] && [ "$FREE_DISK_KB" -lt "$REQUIRED_DISK_KB" ]; then
        echo "  [CRITICAL ERROR] Insufficient disk space on staging host! Required: ${REQUIRED_DISK_KB}KB, Available: ${FREE_DISK_KB}KB" >&2
        exit 1
    fi
    echo "  [OK] Disk space preflight passed (Available: ${FREE_DISK_KB}KB, Required: ${REQUIRED_DISK_KB}KB)."
fi

# Verify PostgreSQL Version (PostgreSQL 15+ required)
SERVER_VERSION_NUM=$(PGPASSWORD="${STAGING_PG_PASSWORD:-}" psql -h "$STAGING_PG_HOST" -p "$STAGING_PG_PORT" -U "$STAGING_PG_USER" -d postgres -t -A -c "SHOW server_version_num;" 2>/dev/null || echo "0")
if [ "$SERVER_VERSION_NUM" -lt 150000 ]; then
    echo "  [CRITICAL ERROR] Target PostgreSQL server version is < 15.0 ($SERVER_VERSION_NUM)! Supported version is PostgreSQL 15+." >&2
    exit 1
fi
echo "  [OK] PostgreSQL server version verified ($SERVER_VERSION_NUM >= 150000)."

# ------------------------------------------------------------------------------
# STEP 4: SCRATCH DATABASE CREATION WITH COLLISION RESISTANCE
# ------------------------------------------------------------------------------
echo "==> Step 4: Generating Collision-Resistant Scratch Database..."

HEX_TOKEN=$(head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n' 2>/dev/null || printf '%04x%04x' "$RANDOM" "$$")
DRILL_DB="cmd_restore_drill_${TIMESTAMP}_${HEX_TOKEN}"

# Positive safety assertion: name must strictly match scratch pattern
if [[ ! "$DRILL_DB" =~ ^cmd_restore_drill_[0-9]{8}-[0-9]{6}_[0-9a-f]+$ ]] && [[ ! "$DRILL_DB" =~ ^cmd_restore_drill_[0-9]{8}_[0-9]{6}_[0-9a-f]+$ ]]; then
    echo "  [CRITICAL ERROR] Generated scratch database name '$DRILL_DB' violates safe pattern!" >&2
    exit 1
fi

# Negative fail-closed guard: explicitly disallow protected databases
case "$DRILL_DB" in
    cmd_office*|cmd_office_staging*|postgres*|template0*|template1*)
        echo "  [CRITICAL ERROR] Refusing protected database name '$DRILL_DB'!" >&2
        exit 1
        ;;
esac

# Check collision: ensure database does NOT already exist
DB_EXISTS=$(PGPASSWORD="${STAGING_PG_PASSWORD:-}" psql -h "$STAGING_PG_HOST" -p "$STAGING_PG_PORT" -U "$STAGING_PG_USER" -d postgres -t -A -c "SELECT COUNT(*) FROM pg_database WHERE datname='$DRILL_DB';" 2>/dev/null || echo "1")
if [ "$DB_EXISTS" -ne 0 ]; then
    echo "  [CRITICAL ERROR] Scratch database '$DRILL_DB' already exists! Aborting to prevent collision." >&2
    exit 1
fi

echo "  Creating scratch database '$DRILL_DB' with UTF-8 encoding..."
if ! PGPASSWORD="${STAGING_PG_PASSWORD:-}" psql -h "$STAGING_PG_HOST" -p "$STAGING_PG_PORT" -U "$STAGING_PG_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE \"$DRILL_DB\" WITH ENCODING 'UTF8' TEMPLATE template1;" > /dev/null 2>&1; then
    echo "  [CRITICAL ERROR] Failed to create scratch database '$DRILL_DB' on target instance!" >&2
    exit 1
fi
echo "  [SUCCESS] Created disposable scratch database: $DRILL_DB"

DRILL_CLEANUP_PENDING=1
cleanup_scratch_db() {
    local exit_code=$?
    if [ "$DRILL_CLEANUP_PENDING" -eq 1 ]; then
        if [ "$exit_code" -ne 0 ]; then
            echo ""
            echo "  ======================================================================"
            echo "  [DIAGNOSTIC EVIDENCE PRESERVED] Restoration drill failed (exit: $exit_code)!"
            echo "  Scratch database '$DRILL_DB' has been intentionally PRESERVED for investigation."
            echo "  Host: $STAGING_PG_HOST:$STAGING_PG_PORT, Database: $DRILL_DB"
            echo "  Once analyzed, remove manually using:"
            echo "    dropdb -h $STAGING_PG_HOST -p $STAGING_PG_PORT -U $STAGING_PG_USER \"$DRILL_DB\""
            echo "  ======================================================================"
        else
            echo "  Tearing down scratch database '$DRILL_DB'..."
            # Terminate active connections before dropping
            PGPASSWORD="${STAGING_PG_PASSWORD:-}" psql -h "$STAGING_PG_HOST" -p "$STAGING_PG_PORT" -U "$STAGING_PG_USER" -d postgres -c \
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DRILL_DB' AND pid <> pg_backend_pid();" > /dev/null 2>&1 || true

            if ! PGPASSWORD="${STAGING_PG_PASSWORD:-}" dropdb -h "$STAGING_PG_HOST" -p "$STAGING_PG_PORT" -U "$STAGING_PG_USER" "$DRILL_DB" 2>/dev/null; then
                echo "  [CRITICAL ERROR] Failed to drop scratch database '$DRILL_DB'! Manual removal required." >&2
                exit 1
            fi
            echo "  [SUCCESS] Scratch database '$DRILL_DB' safely dropped."
        fi
    fi
    exit "$exit_code"
}
trap cleanup_scratch_db EXIT SIGHUP SIGINT SIGTERM

# ------------------------------------------------------------------------------
# STEP 5: EXECUTE RESTORATION
# ------------------------------------------------------------------------------
echo "==> Step 5: Executing Restoration into $DRILL_DB..."

RESTORE_START_TIME=$(date +%s)
RESTORE_STATUS=0

if [ "$ARCHIVE_FORMAT" = "PG_CUSTOM_DUMP" ]; then
    echo "  Restoring PostgreSQL custom-format archive via pg_restore..."
    set +e
    PGPASSWORD="${STAGING_PG_PASSWORD:-}" pg_restore \
        -h "$STAGING_PG_HOST" \
        -p "$STAGING_PG_PORT" \
        -U "$STAGING_PG_USER" \
        --dbname="$DRILL_DB" \
        --no-owner \
        --no-privileges \
        --exit-on-error \
        "$BACKUP_ARCHIVE"
    RESTORE_STATUS=$?
    set -e
elif [ "$ARCHIVE_FORMAT" = "GZIP_SQL" ]; then
    echo "  Restoring plain-text SQL archive via psql pipeline..."
    set +e
    gzip -dc "$BACKUP_ARCHIVE" | PGPASSWORD="${STAGING_PG_PASSWORD:-}" psql \
        -h "$STAGING_PG_HOST" \
        -p "$STAGING_PG_PORT" \
        -U "$STAGING_PG_USER" \
        -d "$DRILL_DB" \
        -v ON_ERROR_STOP=1 > /dev/null 2>&1
    PIPE_STATUSES=("${PIPESTATUS[@]}")
    set -e
    if [ "${PIPE_STATUSES[0]}" -ne 0 ]; then
        RESTORE_STATUS="${PIPE_STATUSES[0]}"
    else
        RESTORE_STATUS="${PIPE_STATUSES[1]}"
    fi
fi

RESTORE_END_TIME=$(date +%s)
RESTORE_DURATION=$(( RESTORE_END_TIME - RESTORE_START_TIME ))

if [ "$RESTORE_STATUS" -ne 0 ]; then
    echo "  [CRITICAL ERROR] Restoration execution failed with exit code $RESTORE_STATUS!" >&2
    exit "$RESTORE_STATUS"
fi
echo "  [SUCCESS] Archive restored cleanly into $DRILL_DB in ${RESTORE_DURATION}s."

# ------------------------------------------------------------------------------
# STEP 6: SCHEMA-ACCURATE INTEGRITY & RELATIONAL ASSERTIONS
# ------------------------------------------------------------------------------
echo "==> Step 6: Performing Schema & Relational Integrity Assertions..."

EXEC_SQL() {
    PGPASSWORD="${STAGING_PG_PASSWORD:-}" psql -h "$STAGING_PG_HOST" -p "$STAGING_PG_PORT" -U "$STAGING_PG_USER" -d "$DRILL_DB" -t -A -c "$1"
}

# 1. Check Table Existence for Core Domain Models
EXPECTED_TABLES=("User" "Role" "Department" "Task" "ActionItem" "Project" "SystemSetting" "AuditLog")
for tbl in "${EXPECTED_TABLES[@]}"; do
    TBL_EXISTS=$(EXEC_SQL "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='$tbl';")
    if [ "$TBL_EXISTS" -eq 0 ]; then
        echo "  [CRITICAL ASSERTION FAILED] Essential domain table '$tbl' is missing from restored schema!" >&2
        exit 1
    fi
done
echo "  [OK] All core domain tables verified present in public schema."

# 2. Row Count Assertions
USER_COUNT=$(EXEC_SQL 'SELECT COUNT(*) FROM "User";')
ROLE_COUNT=$(EXEC_SQL 'SELECT COUNT(*) FROM "Role";')
DEPT_COUNT=$(EXEC_SQL 'SELECT COUNT(*) FROM "Department";')
TASK_COUNT=$(EXEC_SQL 'SELECT COUNT(*) FROM "Task";')
ACTION_COUNT=$(EXEC_SQL 'SELECT COUNT(*) FROM "ActionItem";')
PROJECT_COUNT=$(EXEC_SQL 'SELECT COUNT(*) FROM "Project";')

echo "  Table Counts:"
echo "    - Users:        $USER_COUNT"
echo "    - Roles:        $ROLE_COUNT"
echo "    - Departments:  $DEPT_COUNT"
echo "    - Tasks:        $TASK_COUNT"
echo "    - Action Items: $ACTION_COUNT"
echo "    - Projects:     $PROJECT_COUNT"

if [ "$USER_COUNT" -eq 0 ] || [ "$ROLE_COUNT" -eq 0 ] || [ "$DEPT_COUNT" -eq 0 ]; then
    echo "  [CRITICAL ASSERTION FAILED] Essential base records (Users/Roles/Departments) are empty!" >&2
    exit 1
fi

# 3. Bcrypt Password Hash Format Sanity Check on "User"."passwordHash"
# (Actual Prisma column name verified as passwordHash, NOT password)
INVALID_PW_COUNT=$(EXEC_SQL "SELECT COUNT(*) FROM \"User\" WHERE \"passwordHash\" IS NULL OR \"passwordHash\" !~ '^\$2[ab]\\\$[0-9]{2}\\\$[A-Za-z0-9./]{53}$';")
if [ "$INVALID_PW_COUNT" -ne 0 ]; then
    echo "  [CRITICAL ASSERTION FAILED] $INVALID_PW_COUNT user accounts have malformed or non-bcrypt password hashes!" >&2
    exit 1
fi
echo "  [OK] Password hashes verified valid bcrypt format ($USER_COUNT users checked)."

# 4. Foreign Key Referential Integrity Check on "Task"."assigneeId"
# (Actual Prisma column name verified as assigneeId, NOT assignedToId)
ORPHANED_TASKS=$(EXEC_SQL 'SELECT COUNT(*) FROM "Task" WHERE "assigneeId" IS NOT NULL AND "assigneeId" NOT IN (SELECT id FROM "User");')
if [ "$ORPHANED_TASKS" -ne 0 ]; then
    echo "  [CRITICAL ASSERTION FAILED] Referential integrity broken: $ORPHANED_TASKS tasks reference non-existent users!" >&2
    exit 1
fi
echo "  [OK] Referential integrity verified (0 orphaned task assignments)."

# 5. Conditional Migration Check
# (Prisma db push is used in routine deployments; _prisma_migrations is optional)
MIGRATION_TABLE_EXISTS=$(EXEC_SQL "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='_prisma_migrations';")
MIGRATION_COUNT=0
if [ "$MIGRATION_TABLE_EXISTS" -ne 0 ]; then
    MIGRATION_COUNT=$(EXEC_SQL 'SELECT COUNT(*) FROM "_prisma_migrations";')
    echo "  [NOTE] _prisma_migrations table present ($MIGRATION_COUNT records recorded)."
else
    echo "  [NOTE] _prisma_migrations table not present (Database was provisioned via Prisma db push)."
fi

# ------------------------------------------------------------------------------
# STEP 7: RECORD RESTORATION AUDIT EVIDENCE
# ------------------------------------------------------------------------------
cat << EOF > "$RESULT_LOG"
{
  "timestamp": "$TIMESTAMP",
  "outcome": "SUCCESS",
  "backup_archive": "$BACKUP_ARCHIVE",
  "archive_format": "$ARCHIVE_FORMAT",
  "archive_bytes": $ARCHIVE_BYTES,
  "sha256_checksum": "$BACKUP_CHECKSUM",
  "staging_host": "$STAGING_PG_HOST",
  "staging_port": "$STAGING_PG_PORT",
  "scratch_database": "$DRILL_DB",
  "restore_duration_seconds": $RESTORE_DURATION,
  "integrity_assertions": {
    "users": $USER_COUNT,
    "roles": $ROLE_COUNT,
    "departments": $DEPT_COUNT,
    "tasks": $TASK_COUNT,
    "action_items": $ACTION_COUNT,
    "projects": $PROJECT_COUNT,
    "invalid_password_hashes": $INVALID_PW_COUNT,
    "orphaned_tasks": $ORPHANED_TASKS,
    "prisma_migrations": $MIGRATION_COUNT
  }
}
EOF

echo "======================================================================"
echo "[SUCCESS] Database Restoration Drill Completed & Verified!"
echo "Audit Log: $RESULT_LOG"
echo "======================================================================"
