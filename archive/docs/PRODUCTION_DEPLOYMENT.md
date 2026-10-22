# Production Deployment Guide: Admin Email Templates Feature

This guide provides the exact step-by-step procedure for deploying the **Admin Notification Email Templates Management** patch to the live Ubuntu Linux VPS production server for the **HARTEK Group CMD Office Command Center**.

---

## Safety Guarantees

> [!IMPORTANT]
> - **Zero Data Loss**: This deployment performs **no destructive operations** (`DROP`, `TRUNCATE`, `DELETE`, `UPDATE` on existing production data).
> - **Mandatory Pre-Deployment Backup**: Database and application snapshots are automatically executed and verified before code or schema changes are applied.
> - **Graceful Fallbacks**: If any email template is missing or disabled, the application seamlessly falls back to default system templates without interrupting password resets or user management actions.

---

## Step-by-Step VPS Deployment Procedure

### STEP 1 — SSH into Ubuntu Linux VPS
Connect to your production server via SSH:
```bash
ssh username@your-vps-ip
```

### STEP 2 — Navigate to Application Directory
Change directory to the production workspace root:
```bash
cd /var/www/CMDDashboard
```

### STEP 3 — Verify Current Production Status
Check that the application and database services are currently healthy:
```bash
pm2 status
git status
git rev-parse HEAD
```

### STEP 4 — Download / Transfer Deployment Package
Upload the `deployment-package` or fetch the git commit:
```bash
# Verify deployment package files exist
ls -la deployment-package/patch/email-template-feature.patch
ls -la deployment-package/scripts/
```

### STEP 5 — Execute Automated Deployment Script
Run the automated defensive deployment script:
```bash
chmod +x deployment-package/scripts/*.sh
./deployment-package/scripts/deploy-production.sh
```

*(Note: `deploy-production.sh` automatically performs pre-checks, database backup, application snapshot, git checkpoint tagging, patch application, TypeScript compilation, additive schema migration, PM2 process reload, and live HTTP health check.)*

---

## Manual Execution Steps (Optional Step-by-Step Breakdown)

If you prefer executing steps manually instead of using `deploy-production.sh`:

1. **Create Database & Application Backup**:
   ```bash
   ./deployment-package/scripts/backup-production.sh
   ```
2. **Apply Git Patch**:
   ```bash
   git apply deployment-package/patch/email-template-feature.patch
   ```
3. **Build Backend**:
   ```bash
   cd backend
   npm run build
   cd ..
   ```
4. **Build Frontend**:
   ```bash
   cd frontend
   npm run build
   cd ..
   ```
5. **Run Additive Database Schema Push**:
   ```bash
   cd backend
   npx prisma db push --skip-generate
   cd ..
   ```
6. **Reload PM2 Application Processes**:
   ```bash
   pm2 reload ecosystem.config.js
   ```
7. **Perform Health Check**:
   ```bash
   curl -f http://127.0.0.1:4000/api/settings
   curl -f http://127.0.0.1:3000/
   ```

---

## Post-Deployment Verification Checklist

1. **Admin Console Navigation**: Log in as an Administrator (`/admin`) and verify the **Email Templates** tab appears in the sidebar menu.
2. **Template Roster & Creation**: Create a test template for `PASSWORD_RESET` or `USER_CREATED`.
3. **Live Preview**: Click **Preview** on the template form and verify rendered subject and body text.
4. **Non-Admin Security Verification**: Attempt to access `/api/email-templates` using a non-admin session to confirm `403 Forbidden` is returned.
5. **Workflow Regression Testing**: Trigger a password reset from `/forgot-password` to confirm email dispatch or local fallback.
