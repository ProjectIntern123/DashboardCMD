# HARTEK Group CMD Office Command Center — Canonical Deployment & Operations Guide

> **Authoritative Production Operations Guide**  
> *Target System:* Ubuntu Linux 20.04 / 22.04 / 24.04 LTS (Hostinger KVM VPS)  
> *Process Manager:* PM2 (`ecosystem.config.js`)  
> *Reverse Proxy / SSL:* Nginx + Let's Encrypt Certbot  
> *Database:* PostgreSQL 15+ (Prisma ORM)  

---

## 1. System Architecture & Port Allocation

The application runs as two decoupled production services managed by PM2 behind an Nginx reverse proxy:

| Service | Internal Port | Process Manager Name | Artifact Path | Public Path |
| :--- | :--- | :--- | :--- | :--- |
| **Backend API (NestJS 11)** | `4000` | `cmd-backend` | `backend/dist/src/main.js` | `https://<domain>/api/` |
| **Frontend Web (Next.js 16)** | `3000` | `cmd-frontend` | `frontend/.next` | `https://<domain>/` |
| **Database (PostgreSQL)** | `5432` | `postgresql` service | Managed by systemd | Internal only (`127.0.0.1`) |

---

## 2. Server Prerequisites & One-Time VPS Provisioning

For new or replacement VPS instances:

1. **Run Provisioning Script:**
   ```bash
   chmod +x scripts/setup-server.sh
   ./scripts/setup-server.sh
   ```
   *Installs: Node.js v20 LTS, npm, PostgreSQL, PM2, Nginx, Certbot, build-essential, and configures UFW firewall (ports 22, 80, 443).*

2. **Configure Nginx:**
   Copy the bundled Nginx configuration:
   ```bash
   sudo cp nginx/cmd-dashboard.conf /etc/nginx/sites-available/cmd-dashboard.conf
   sudo ln -s /etc/nginx/sites-available/cmd-dashboard.conf /etc/nginx/sites-enabled/
   # Update YOUR_DOMAIN.com in /etc/nginx/sites-available/cmd-dashboard.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```

3. **Install SSL via Certbot:**
   ```bash
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

---

## 3. Environment Configuration (`.env`)

The application requires environment configuration in the root directory:

```env
# Database Connection (PostgreSQL)
DATABASE_URL="postgresql://<db_user>:<db_password>@127.0.0.1:5432/cmd_office?schema=public"

# Authentication & JWT Secrets
JWT_SECRET="<generate_strong_random_secret_minimum_32_chars>"
JWT_REFRESH_SECRET="<generate_strong_random_secret_minimum_32_chars>"
JWT_ACCESS_EXPIRATION="15m"
JWT_REFRESH_EXPIRATION="7d"
SECURE_COOKIES="true"

# Service Ports & Public URLs
PORT=4000
FRONTEND_URL="https://yourdomain.com"
NEXT_PUBLIC_API_URL="https://yourdomain.com/api"

# Microsoft 365 SMTP Configuration (Optional in .env; manageable via Admin Console)
SMTP_HOST="smtp.office365.com"
SMTP_PORT=587
SMTP_USERNAME="cmd-office@hartek.com"
SMTP_PASSWORD="<app_or_mailbox_password>"
SMTP_SENDER_NAME="HARTEK CMD Office"
SMTP_SENDER_EMAIL="cmd-office@hartek.com"
```

To sync root environment across backend and frontend subprojects:
```bash
node scripts/sync-env.js
```

---

## 4. Canonical Production Release Pipeline

Production releases are managed strictly through version-controlled Git commits on the `main` or `master` branch.

### Standard 3-Step Deployment Procedure:

#### STEP 1: Create Pre-Deployment Backup
Always generate a verified database and application snapshot before deploying code:
```bash
./scripts/backup-production.sh
```
- Performs a full `pg_dump` of PostgreSQL, piping directly through `gzip`.
- Verifies archive integrity with `gzip -t` and checks for the PostgreSQL completion marker.
- Creates an application source archive.
- Retains at least 5 snapshots in `/var/backups/cmd-dashboard` (or `$HOME/backups/cmd-dashboard`).

#### STEP 2: Execute Canonical Deployment
Run the non-interactive automated deployment script inside a persistent terminal session (`tmux` or `screen`):

```bash
# Recommended: Attach to or start a persistent tmux session to protect against network drops
tmux new -s deploy || tmux attach -t deploy

./scripts/deploy-production.sh
```

> [!NOTE]
> **Terminal Session Persistence (`tmux` / `screen`):**
> Running deployments inside a persistent terminal multiplexer (`tmux` or `screen`) ensures that the deployment script survives client-side SSH disconnections, transient network drops, and local terminal window closure. However, terminal multiplexers operate in user space and **cannot** protect processes against non-catchable signals (`SIGKILL`), kernel out-of-memory (OOM) termination, host power loss, or kernel failure. Ensure the server has adequate swap memory configured and always generate a pre-deployment backup.

**Safety Protections Executed Automatically:**
1. **Working Tree Guard:** Rejects deployment if untracked or uncommitted changes exist on the server.
2. **Branch Check:** Verifies server is on `main` or `master` and can be fast-forwarded without merge conflicts.
3. **Non-Blocking Concurrency Lock:** Automatically acquires an exclusive non-blocking lock (`flock` on `.releases/deploy.lock`) to prevent concurrent deployment executions from corrupting Git state, build caches, or active runtime artifacts.
4. **Pre-Build Disk Space Preflight:** Strictly validates that at least 2.0 GB (2,097,152 KB) free disk space is available before compiling candidate builds or snapshotting artifacts (enforcing a 1.5 GB minimum floor if overridden).
5. **Signal & Interruption Hardening:** Catches `SIGHUP` (terminal disconnect), `SIGINT` (Ctrl+C), and `SIGTERM` signals; automatically cleans temporary candidate artifacts and non-destructively reverts Git `HEAD` if interrupted prior to activation.
6. **Migration Lock:** Scans release diff for migration files; if unbaselined migrations are found, deployment **halts immediately** before touching Git or database state.
7. **Isolated Candidate Compilation:** Compiles `backend/dist.candidate` and `frontend/.next.candidate` in isolated directories without modifying active runtime artifacts.
8. **Entry Point Verification:** Validates that candidate builds contain required manifests and entry points (`src/main.js`, `src/app.module.js`, `BUILD_ID`, `server`, `static`).
9. **Atomic Directory Swap:** Preserves active build to `.prev` and swaps candidate artifacts into production paths.
10. **Process Reload:** Reloads PM2 zero-downtime cluster via `pm2 reload ecosystem.config.js`.
11. **Automated Health Probes:** Probes `/api/settings/public` (port 4000) and `/` (port 3000).
    - If health checks fail across 5 attempts, **automatically invokes `scripts/rollback-production.sh`**.

---

## 5. Emergency Rollback Procedures

### Automated Rollback (Self-Healing)
If `deploy-production.sh` detects that application endpoints fail to respond with HTTP 200 after deployment, it immediately disarms failure traps and executes `scripts/rollback-production.sh`.

### Manual Emergency Rollback
If an issue is detected after deployment approval, execute:
```bash
./scripts/rollback-production.sh
```
**What the Rollback Script Does:**
1. Verifies the existence and checksum integrity of `backend/dist.prev` and `frontend/.next.prev`.
2. Atomically swaps `.prev` artifacts back into active production directories (`backend/dist`, `frontend/.next`).
3. Reads the previously recorded commit from `.releases/previous-release.json` (or `.prev-deployed-commit`) and non-destructively checks out that commit.
4. Reloads PM2 processes (`pm2 reload ecosystem.config.js || pm2 restart all`).
5. Re-probes endpoints to verify system recovery.

---

## 6. Database Restoration, Disaster Recovery & Off-Site Strategy

> [!CRITICAL]
> **Data Preservation Hazard & Non-Merge Semantics:**
> Plain SQL backup files (`.sql.gz`) produced by `pg_dump` contain direct `CREATE TABLE`, `ALTER TABLE`, and `INSERT INTO` statements without `--clean` drops.
> A plain SQL dump is **not** a merge or differential patch. It **must never** be piped into an existing populated production database as a routine action.
> Piping a dump into an active database will cause immediate primary key conflicts (`duplicate key value violates unique constraint`), foreign key violations, and partial state corruption.
> Always follow the isolated verification procedure below before considering any production recovery.

---

### Procedure A: Isolated Verification & Non-Destructive Restore Drill (Default)

Use this procedure to verify backup integrity, test data completeness, or conduct disaster recovery drills without touching the active production database.

#### Step 1: Locate and Validate Backup Archive Integrity
```bash
# Set strict pipeline failure handling
set -euo pipefail

# Locate latest verified backup archive
BACKUP_DIR="/var/backups/cmd-dashboard"
LATEST_BACKUP=$(ls -td "$BACKUP_DIR"/backup-* 2>/dev/null | head -n 1)
SQL_GZ="$LATEST_BACKUP/$(basename "$LATEST_BACKUP" | sed 's/backup-/db-backup-/').sql.gz"

echo "Evaluating candidate archive: $SQL_GZ"

# 1. Test gzip archive integrity (CRC-32 and compressed block validation)
gzip -t "$SQL_GZ" && echo "[OK] Archive gzip integrity valid."

# 2. Verify dump completion marker (guards against truncated dumps)
gzip -dc "$SQL_GZ" | tail -n 25 | grep -q "PostgreSQL database dump complete" && echo "[OK] PostgreSQL completion marker present."
```

#### Step 2: Create Isolated Verification Database
Never use the production database (`cmd_office`) for verification. Always restore into a dedicated, isolated scratch database:

```bash
VERIFY_DB="cmd_restore_verification_$(date +%Y%m%d_%H%M%S)"

# Create isolated database owned by postgres superuser
createdb -U postgres "$VERIFY_DB"
echo "Created isolated verification database: $VERIFY_DB"
```

#### Step 3: Execute Restoration into Isolated Database
Execute the pipeline with strict error halting (`ON_ERROR_STOP=on`) and capture pipeline exit statuses:

```bash
set -o pipefail

# Decompress and restore into verification database
gzip -dc "$SQL_GZ" | psql -U postgres -d "$VERIFY_DB" -v ON_ERROR_STOP=1

RESTORE_STATUS=$?
if [ "$RESTORE_STATUS" -ne 0 ]; then
    echo "[CRITICAL ERROR] Database restoration pipeline failed with exit code: $RESTORE_STATUS"
    exit 1
fi
echo "[SUCCESS] Archive restored cleanly into verification database: $VERIFY_DB"
```

#### Step 4: Verify Schema, Object Counts & Relational Integrity
Run non-destructive integrity queries against the verification database:

```bash
# 1. Inspect table counts in core models
psql -U postgres -d "$VERIFY_DB" -c "
SELECT 'User' AS model, COUNT(*) FROM \"User\"
UNION ALL
SELECT 'Role' AS model, COUNT(*) FROM \"Role\"
UNION ALL
SELECT 'Task' AS model, COUNT(*) FROM \"Task\"
UNION ALL
SELECT 'Department' AS model, COUNT(*) FROM \"Department\";
"

# 2. Inspect latest Prisma migration record
psql -U postgres -d "$VERIFY_DB" -c "
SELECT id, migration_name, finished_at, rolled_back_at
FROM \"_prisma_migrations\"
ORDER BY finished_at DESC LIMIT 5;
"
```

#### Step 5: Clean Up Verification Database
Once data integrity is validated, safely destroy the temporary scratch database using positive safety validation:

```bash
# Positive safety assertion: verify database name matches verification naming pattern
if [[ -n "${VERIFY_DB:-}" && "$VERIFY_DB" =~ ^cmd_restore_verification_[0-9]{8}_[0-9]{6}$ ]]; then
    dropdb -U postgres "$VERIFY_DB"
    echo "Removed verification database: $VERIFY_DB"
else
    echo "[CRITICAL ERROR] Target database '$VERIFY_DB' does not match safe verification prefix. Aborting drop to protect databases."
    exit 1
fi
```

---

### Procedure B: Controlled Production Disaster Recovery (Catastrophic Loss Only)

> [!WARNING]
> **Manual Operational Protocol — Untested Procedure:**
> This procedure is reserved strictly for complete data recovery scenarios (e.g. storage volume reconstruction, corrupted cluster rebuild).
> This procedure is a documented operational protocol and has **not** been executed or rehearsed against live production databases.
> It requires:
> 1. An explicitly authorized human operator and approved maintenance window.
> 2. A verified backup archive whose completion marker and gzip integrity have been confirmed.
> 3. An independent operational decision confirming that current production data cannot be recovered without a restore.
> 4. Full application downtime.

1. **Halt Application Ingress:**
   ```bash
   cd /var/www/cmd-dashboard
   pm2 stop ecosystem.config.js
   ```

2. **Capture Emergency Safety Snapshot of Current Database State:**
   Even if the database is in an inconsistent state, always take an emergency pre-recovery snapshot before proceeding:
   ```bash
   pg_dump -U postgres cmd_office | gzip > "/var/backups/cmd-dashboard/emergency-pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz" || true
   ```

3. **Terminate Active Database Connections:**
   ```bash
   psql -U postgres -c "
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE datname = 'cmd_office' AND pid <> pg_backend_pid();
   "
   ```

4. **Isolate Compromised Database & Initialize Clean Target:**
   ```bash
   # Rename existing database rather than dropping to preserve forensic copy
   psql -U postgres -c "ALTER DATABASE cmd_office RENAME TO cmd_office_corrupted_$(date +%Y%m%d_%H%M%S);"

   # Create fresh, clean production database
   createdb -U postgres -O postgres cmd_office
   ```

5. **Execute Stream Restoration with Strict Pipeline Guard:**
   ```bash
   set -o pipefail
   gzip -dc "$SQL_GZ" | psql -U postgres -d cmd_office -v ON_ERROR_STOP=1
   ```

6. **Re-Apply Database Role Ownership & Schema Grants:**
   Because `psql` restores tables under the executing user (`postgres`), ensure the application runtime user (e.g. `cmd_user` configured in `DATABASE_URL`) has requisite privileges:
   ```bash
   APP_DB_USER="cmd_user" # Verify from backend/.env DATABASE_URL
   psql -U postgres -d cmd_office -c "
   GRANT ALL ON SCHEMA public TO ${APP_DB_USER};
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${APP_DB_USER};
   GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${APP_DB_USER};
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${APP_DB_USER};
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${APP_DB_USER};
   "
   ```

7. **Verify Application Health & Restart Services:**
   ```bash
   pm2 start ecosystem.config.js
   pm2 status
   curl -f http://127.0.0.1:4000/api/settings/public
   curl -f http://127.0.0.1:3000/
   ```

---

### Off-Site Backup Strategy & Production Readiness Plan

Currently, backups created by `scripts/backup-production.sh` reside strictly on the local VPS disk (`/var/backups/cmd-dashboard`). This presents a single point of failure. The following architecture is required for production data resilience:

#### 1. Transport & At-Rest Encryption
- **Encryption at Rest:** Before transmitting off-site, encrypt backup archives client-side using AES-256-GCM via GPG or OpenSSL:
  ```bash
  gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file /etc/cmd-dashboard/backup.key "$DB_BACKUP_FILE"
  ```
  The decryption key must be stored securely outside the backup repository (e.g. in HashiCorp Vault, AWS KMS, or secure corporate password vault).
- **Encryption in Transit:** All off-site transfers must mandate TLS 1.3 / HTTPS (for cloud object storage) or SSH with Ed25519 host keys (for remote rsync).

#### 2. Least-Privilege Backup Credentials
- **Object Storage IAM Policy:** Dedicated IAM user or role with permissions restricted strictly to `s3:PutObject` and `s3:PutObjectTagging` on the backup bucket path.
- **WORM / Object Lock:** Enable S3 Object Lock (Compliance mode) or append-only bucket policies. Explicitly **deny** `s3:DeleteObject`, `s3:DeleteBucket`, and `s3:PutLifecycleConfiguration` to prevent ransomware or compromised VPS credentials from destroying historical archives.
- **Database Dump User:** Use a dedicated PostgreSQL dump role with `pg_read_all_data` privileges (PostgreSQL 14+) rather than the `postgres` superuser.

#### 3. Recovery Objectives & Retention Schedule
- **Recovery Point Objective (RPO):** Maximum 1 hour. Achieved via scheduled daily full logical dumps combined with continuous PostgreSQL Write-Ahead Log (WAL) archiving via `pg_receivewal` or Barman.
- **Recovery Time Objective (RTO):** Maximum 2 hours to reconstruct database, restore latest verified baseline, replay WAL, and complete service verification.
- **Retention Lifecycle:**
  - Local VPS: Retain last 5 daily backups (rolling cleanup).
  - Off-Site Storage: Daily backups retained for 30 days, weekly snapshots retained for 12 weeks, monthly snapshots retained for 12 months in cold/archival tier (S3 Glacier / Azure Archive).

#### 4. Automated Verification & Periodic Drills
- **Checksum Manifest:** Every backup must compute and store a companion SHA-256 digest (`sha256sum "$DB_BACKUP_FILE" > "${DB_BACKUP_FILE}.sha256"`).
- **Quarterly Disaster Recovery Drills:** SRE team must execute a rehearsed restoration into an isolated staging container once per quarter to validate that backup archives remain uncorrupted, schema migrations match codebase requirements, and recovery runbooks remain accurate.

---

## 7. Daily Operations, Logs & Process Monitoring

### PM2 Process Management
```bash
# Check status of production services
pm2 status

# View real-time aggregated logs
pm2 logs

# View specific service logs
pm2 logs cmd-backend
pm2 logs cmd-frontend

# Restart services manually
pm2 reload ecosystem.config.js
```

### PM2 Process Diagnostics & Recovery Runbook

> [!IMPORTANT]
> **Working Directory Precondition:**
> All PM2 commands must be executed strictly from the **application repository root** (e.g. `/var/www/cmd-dashboard` on Ubuntu).
> Running PM2 commands from subdirectories (`backend/` or `frontend/`) will cause PM2 to resolve relative paths incorrectly (`./backend/backend` or `./frontend/frontend`) and crash.
> Never execute recovery commands blindly. Always diagnose process state and inspect error logs first.

#### Diagnostic Step: Distinguish Application Failure vs. Daemon Crash
Run:
```bash
pm2 status
```
- **Scenario A (Daemon Active, Processes Stopped or Errored):**
  PM2 responds and lists `cmd-backend` and `cmd-frontend` with status `errored`, `stopped`, or high restart counts.
  *Action:* The daemon is healthy. Do **not** run `pm2 kill`. Proceed to **Procedure A** below.
- **Scenario B (Daemon Dead, Hung, or Socket Timeout):**
  The command hangs, times out, or returns `[PM2][ERROR] Daemon not launched` or `connect ECONNREFUSED /root/.pm2/rpc.sock`.
  *Action:* The daemon is dead or corrupt. Proceed to **Procedure B** below.

---

#### Procedure A: Recovering Stopped or Errored Applications (Daemon Healthy)
1. **Inspect Recent Error Logs:**
   ```bash
   pm2 logs cmd-backend --lines 50 --err
   pm2 logs cmd-frontend --lines 50 --err
   ```
   Identify root cause (e.g. database unreachable, missing environment variable, port conflict).
2. **Verify Environment Configurations (Without Printing Secrets):**
   ```bash
   test -f backend/.env && echo "backend/.env: EXISTS" || echo "backend/.env: MISSING"
   test -f .env && echo ".env: EXISTS" || echo ".env: MISSING"
   ```
3. **Gracefully Reload Application Services:**
   ```bash
   pm2 reload ecosystem.config.js
   ```
   If reload fails due to dead cluster workers, issue:
   ```bash
   pm2 restart ecosystem.config.js
   ```
4. **Probe Application Health:**
   ```bash
   curl -f http://127.0.0.1:4000/api/settings/public
   curl -f http://127.0.0.1:3000/
   ```

---

#### Procedure B: Recovering from Daemon Crash or Unresponsive Socket
1. **Verify Application Root Directory:**
   ```bash
   pwd # Must be project root containing ecosystem.config.js, backend/, and frontend/
   ```
2. **Inspect & Clear Orphaned Node Processes:**
   ```bash
   # Check if orphaned Node processes are still holding application ports
   ss -tulpn | grep -E ':(4000|3000)' || true
   ```
3. **Terminate Broken PM2 Daemon:**
   ```bash
   pm2 kill
   ```
4. **Boot Canonical Services from Ecosystem Configuration:**
   > [!WARNING]
   > Do **NOT** run `pm2 resurrect`. `pm2 resurrect` restores state from `~/.pm2/dump.pm2`, which may be stale, uninitialized, or point to corrupted previous directories. Booting directly from `ecosystem.config.js` guarantees that verified entry points (`dist/src/main.js`, `next start`), correct working directories (`./backend`, `./frontend`), and configured ports (4000, 3000) are loaded.
   ```bash
   pm2 start ecosystem.config.js
   ```
5. **Verify Running State & Health Probes:**
   ```bash
   pm2 status
   curl -f http://127.0.0.1:4000/api/settings/public
   curl -f http://127.0.0.1:3000/
   ```
6. **Save Verified Running State to Systemd Boot:**
   ```bash
   pm2 save
   ```

### Log File Locations
- PM2 logs: `./logs/backend-out.log`, `./logs/backend-error.log`, `./logs/frontend-out.log`, `./logs/frontend-error.log`
- Nginx access/error logs: `/var/log/nginx/access.log`, `/var/log/nginx/error.log`
- PostgreSQL logs: `/var/log/postgresql/`

### Administrative Recovery
If admin user credentials need to be re-provisioned or updated from the CLI:
```bash
node scripts/create-admin.js "admin@hartek.com" "SecurePassword123!" "System Administrator" "SA"
```
