# Patch Manifest: Admin Notification Email Templates Feature

- **Feature Name**: Notification Email Templates Management (Admin Console)
- **Target Application**: HARTEK Group CMD Office Command Center
- **Patch File**: `deployment-package/patch/email-template-feature.patch`
- **Compatibility**: NestJS 11, Next.js 16 (App Router), Prisma 6.4.0, PostgreSQL

---

## 1. Zero-Data-Loss Confirmation

```text
Existing production records modified: NO
Existing users modified: NO
Existing authentication records modified: NO
Existing passwords modified: NO
Existing tables modified: NO
New table(s): YES (EmailTemplate)
```

---

## 2. Files Added & Modified

### New Files Added
- `backend/src/email-templates/email-templates.controller.ts`
- `backend/src/email-templates/email-templates.service.ts`
- `backend/src/email-templates/email-templates.module.ts`
- `backend/src/email-templates/dto/create-email-template.dto.ts`
- `backend/src/email-templates/dto/update-email-template.dto.ts`
- `frontend/src/app/admin/components/EmailTemplatesAdmin.tsx`

### Existing Files Modified
- `backend/prisma/schema.prisma` (Added `EmailTemplate` model fields and index)
- `backend/src/app.module.ts` (Imported `EmailTemplatesModule`)
- `backend/src/audit/audit.interceptor.ts` (Mapped `/email-templates` for audit logging)
- `backend/src/auth/auth.service.ts` (Integrated `sendTemplateEmail` into password reset flow)
- `backend/src/user/user.service.ts` (Integrated `sendTemplateEmail` into user creation and temp password reset flows)
- `backend/src/settings/settings.mailer.ts` (Added `sendTemplateEmail` helper method)
- `backend/src/settings/settings.module.ts` (Imported `EmailTemplatesModule`)
- `frontend/src/app/admin/page.tsx` (Added Email Templates sidebar tab and view rendering)
- `frontend/src/lib/api.ts` (Added `patch` helper method)

---

## 3. Database Schema Migration

- **New Table**: `EmailTemplate`
- **Fields**:
  - `id` (`Uuid`, Primary Key)
  - `name` (`String`, Unique)
  - `eventKey` (`String`, Unique Index)
  - `subject` (`String`)
  - `body` (`Text`)
  - `description` (`String`, Optional)
  - `isActive` (`Boolean`, Default `true`)
  - `createdAt` (`DateTime`, Default `now()`)
  - `updatedAt` (`DateTime`, Auto updated)

---

## 4. API Endpoints

- `GET /api/email-templates` (Admin Only)
- `GET /api/email-templates/events` (Admin Only)
- `GET /api/email-templates/:id` (Admin Only)
- `POST /api/email-templates` (Admin Only)
- `PUT /api/email-templates/:id` (Admin Only)
- `PATCH /api/email-templates/:id/toggle` (Admin Only)
- `DELETE /api/email-templates/:id` (Admin Only)
- `POST /api/email-templates/preview` (Admin Only)

---

## 5. Third-Party Dependencies

- **Dependencies Added**: None (reused existing `class-validator`, `nodemailer`, `react-icons`, `@prisma/client`).
