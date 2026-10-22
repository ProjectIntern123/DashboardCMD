# Production Rollback Guide: Admin Email Templates Feature

This document outlines the emergency rollback procedure for reverting the **Email Templates Management** patch while preserving production data integrity.

---

## CRITICAL ROLLBACK POLICY: APPLICATION vs DATABASE

> [!WARNING]
> - **Do NOT restore the entire database dump** unless there is confirmed PostgreSQL data corruption.
> - Application rollback and database rollback are separate operations.
> - Because this patch only added a **new, independent table (`EmailTemplate`)**, the previous code version runs safely without interference even if the new table remains present in PostgreSQL.

---

## Emergency Application Rollback Procedure

### 1. Execute Automated Rollback Script
SSH into the production server and run:
```bash
cd /var/www/CMDDashboard
chmod +x deployment-package/scripts/rollback-production.sh
./deployment-package/scripts/rollback-production.sh
```

### 2. Manual Application Rollback Steps
If executing manually:
1. **Reverse Git Patch**:
   ```bash
   git apply -R deployment-package/patch/email-template-feature.patch
   ```
2. **Rebuild Backend & Frontend**:
   ```bash
   cd backend && npm run build && cd ..
   cd frontend && npm run build && cd ..
   ```
3. **Reload PM2 Processes**:
   ```bash
   pm2 reload ecosystem.config.js
   ```
4. **Verify Application Health**:
   ```bash
   curl -f http://127.0.0.1:3000/
   curl -f http://127.0.0.1:4000/api/settings
   ```

---

## Confirmation of Data Preservation

- **Users Table**: Untouched.
- **Sessions & Auth Records**: Untouched.
- **Business Modules (Projects, Tasks, Escalations, Meetings)**: Untouched.
- **Email Notification Templates Table**: Preserved safely in database for future zero-data-loss reactivation.
