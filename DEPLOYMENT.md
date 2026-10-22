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
Run the non-interactive automated deployment script:
```bash
./scripts/deploy-production.sh
```
**Safety Protections Executed Automatically:**
1. **Working Tree Guard:** Rejects deployment if untracked or uncommitted changes exist on the server.
2. **Branch Check:** Verifies server is on `main` or `master` and can be fast-forwarded without merge conflicts.
3. **Migration Lock:** Scans release diff for migration files; if unbaselined migrations are found, deployment **halts immediately** before touching Git or database state.
4. **Isolated Candidate Compilation:** Compiles `backend/dist.candidate` and `frontend/.next.candidate` in isolated directories without modifying active runtime artifacts.
5. **Entry Point Verification:** Validates that candidate builds contain required manifests and entry points (`src/main.js`, `src/app.module.js`, `BUILD_ID`, `server`, `static`).
6. **Atomic Directory Swap:** Preserves active build to `.prev` and swaps candidate artifacts into production paths.
7. **Process Reload:** Reloads PM2 zero-downtime cluster via `pm2 reload ecosystem.config.js`.
8. **Automated Health Probes:** Probes `/api/settings/public` (port 4000) and `/` (port 3000).
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

## 6. Database Disaster Recovery (Manual)

If PostgreSQL data is corrupted or lost and must be restored from a backup archive:

```bash
# 1. Locate the desired backup file in the backup directory:
ls -lh /var/backups/cmd-dashboard/

# 2. Decompress and inspect completion marker:
gzip -dc /var/backups/cmd-dashboard/backup-<TIMESTAMP>/db-backup-<TIMESTAMP>.sql.gz | tail -n 10

# 3. Restore to PostgreSQL:
# WARNING: This replaces current database contents with the backup state.
gzip -dc /var/backups/cmd-dashboard/backup-<TIMESTAMP>/db-backup-<TIMESTAMP>.sql.gz | psql -U postgres -d cmd_office
```

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

### Log File Locations
- PM2 logs: `./logs/backend-out.log`, `./logs/backend-error.log`, `./logs/frontend-out.log`, `./logs/frontend-error.log`
- Nginx access/error logs: `/var/log/nginx/access.log`, `/var/log/nginx/error.log`
- PostgreSQL logs: `/var/log/postgresql/`

### Administrative Recovery
If admin user credentials need to be re-provisioned or updated from the CLI:
```bash
node scripts/create-admin.js "admin@hartek.com" "SecurePassword123!" "System Administrator" "SA"
```
