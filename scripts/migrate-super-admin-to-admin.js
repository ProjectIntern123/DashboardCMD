#!/usr/bin/env node
/**
 * scripts/migrate-super-admin-to-admin.js
 *
 * Standalone, explicitly authorized migration script to consolidate legacy "Super Admin" role into "Admin".
 * Extracted from automatic application startup in backend/src/main.ts to ensure ZERO uncontrolled
 * database mutations during server boot.
 *
 * Usage:
 *   node scripts/migrate-super-admin-to-admin.js --dry-run
 *   node scripts/migrate-super-admin-to-admin.js --confirm
 *
 * Safety requirements:
 *   - Supports --dry-run preview reporting target database identity and affected counts without writing.
 *   - Requires explicit --confirm CLI flag to execute any mutations.
 *   - Validates database URL and redacts credentials before display.
 *   - Displays mandatory database backup warning (filesystem rollback does not restore DB records).
 *   - Executes all role, user, approval-matrix, and permission changes inside an atomic Prisma transaction.
 *   - Uses the transaction client (tx) for every database operation inside the transaction.
 *   - Idempotent: safe to run if Super Admin has already been removed.
 *   - Never invoked automatically by deployment, builds, or startup.
 */

const path = require('path');
const fs = require('fs');

// 1. Redact database URL to prevent credential or secret leakage
function redactDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '[EMPTY_OR_UNDEFINED]';
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname || 'unknown-host';
    const port = parsed.port ? `:${parsed.port}` : '';
    const db = (parsed.pathname || '').replace(/^\//, '').split('?')[0];
    return `${parsed.protocol}//[REDACTED]@${host}${port}/${db}`;
  } catch {
    return '[MALFORMED_URL]';
  }
}

// 2. Resolve environment configuration safely (prefer backend/.env, fallback to root .env)
function loadDatabaseConfiguration() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envCandidates = [
    path.join(__dirname, '../backend/.env'),
    path.join(__dirname, '../.env'),
  ];

  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      for (const line of envContent.split(/\r?\n/)) {
        const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2] ? match[2].trim() : '';
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.substring(1, val.length - 1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
      if (process.env.DATABASE_URL) {
        break;
      }
    }
  }

  return process.env.DATABASE_URL || null;
}

const dbUrl = loadDatabaseConfiguration();
if (!dbUrl) {
  console.error('[CRITICAL CONFIG ERROR] No DATABASE_URL found in environment, backend/.env, or .env.');
  console.error('Aborting. Cannot establish database identity.');
  process.exit(1);
}

// 3. Resolve Prisma Client
let PrismaClient;
try {
  PrismaClient = require(path.join(__dirname, '../backend/node_modules/@prisma/client')).PrismaClient;
} catch (e) {
  try {
    PrismaClient = require('@prisma/client').PrismaClient;
  } catch (e2) {
    console.error('[CRITICAL ERROR] Cannot resolve @prisma/client. Run bootstrap first.');
    process.exit(1);
  }
}

async function run() {
  const isDryRun = process.argv.includes('--dry-run');
  const isConfirmed = process.argv.includes('--confirm');

  const sanitizedTarget = redactDatabaseUrl(dbUrl);

  console.log('=========================================================================');
  console.log('   HARTEK CMD — SUPER ADMIN TO ADMIN CONSOLIDATION UTILITY');
  console.log('=========================================================================');
  console.log(`Target Database: ${sanitizedTarget}`);
  console.log('');

  const prisma = new PrismaClient();

  try {
    // Inspect current database state (Read-Only)
    const superAdminRole = await prisma.role.findUnique({
      where: { name: 'Super Admin' },
      include: {
        _count: {
          select: {
            users: true,
            approvalMatrices: true,
            permissions: true,
          },
        },
      },
    });

    const adminRole = await prisma.role.findUnique({
      where: { name: 'Admin' },
      include: {
        _count: {
          select: {
            users: true,
            approvalMatrices: true,
            permissions: true,
          },
        },
      },
    });

    console.log('Role Inventory:');
    console.log(`  - "Admin" role:       ${adminRole ? `Found (ID: ${adminRole.id}, Users: ${adminRole._count.users})` : 'NOT FOUND (Will be created)'}`);
    console.log(`  - "Super Admin" role: ${superAdminRole ? `Found (ID: ${superAdminRole.id}, Users: ${superAdminRole._count.users}, Matrices: ${superAdminRole._count.approvalMatrices}, Perms: ${superAdminRole._count.permissions})` : 'NOT FOUND (Already migrated / Clean)'}`);
    console.log('');

    if (!superAdminRole) {
      console.log('[STATUS: CLEAN] No "Super Admin" role exists in target database.');
      console.log('Database is already canonical. Zero mutations required.');
      console.log('=========================================================================');
      process.exit(0);
    }

    // DRY-RUN MODE: Report findings and exit without writing anything
    if (isDryRun && !isConfirmed) {
      console.log('[DRY-RUN PREVIEW] The following changes would be executed:');
      if (!adminRole) {
        console.log('  1. Create canonical "Admin" role.');
      }
      console.log(`  2. Reassign ${superAdminRole._count.users} user(s) from Super Admin to Admin.`);
      console.log(`  3. Reassign ${superAdminRole._count.approvalMatrices} approval matrix(es) to Admin.`);
      console.log(`  4. Clone ${superAdminRole._count.permissions} permission link(s) to Admin.`);
      console.log('  5. Delete legacy Super Admin permission links.');
      console.log('  6. Delete legacy Super Admin role record.');
      console.log('');
      console.log('[DRY-RUN COMPLETE] Zero records were modified.');
      console.log('To execute this migration, obtain explicit authorization and run with --confirm.');
      console.log('=========================================================================');
      process.exit(0);
    }

    // CONFIRMATION GATE: Require explicit confirmation
    if (!isConfirmed) {
      console.log('=========================================================================');
      console.log('[MANDATORY BACKUP WARNING]');
      console.log('  1. A verified PostgreSQL database backup (pg_dump) is REQUIRED before execution.');
      console.log('  2. Filesystem release rollbacks (scripts/rollback-production.sh) restore ONLY');
      console.log('     application build binaries and do NOT restore database records.');
      console.log('');
      console.log(`Target database to be modified: ${sanitizedTarget}`);
      console.log(`Records to migrate: ${superAdminRole._count.users} users, ${superAdminRole._count.approvalMatrices} matrices, ${superAdminRole._count.permissions} permissions.`);
      console.log('');
      console.log('[BLOCKED] Migration was not executed because --confirm was not specified.');
      console.log('Command to execute:');
      console.log('  node scripts/migrate-super-admin-to-admin.js --confirm');
      console.log('=========================================================================');
      process.exit(1);
    }

    // EXECUTION MODE: Atomic Prisma Interactive Transaction
    console.log('=========================================================================');
    console.log('[EXECUTING] Starting atomic Prisma transaction...');
    console.log('=========================================================================');

    await prisma.$transaction(async (tx) => {
      // 1. Ensure Admin role exists
      let targetAdmin = await tx.role.findUnique({ where: { name: 'Admin' } });
      if (!targetAdmin) {
        targetAdmin = await tx.role.create({ data: { name: 'Admin' } });
        console.log(`  [TX 1/6] Created canonical "Admin" role (ID: ${targetAdmin.id}).`);
      } else {
        console.log(`  [TX 1/6] Using existing "Admin" role (ID: ${targetAdmin.id}).`);
      }

      // 2. Move all users linked to Super Admin to Admin
      const affectedUsers = await tx.user.updateMany({
        where: { roleId: superAdminRole.id },
        data: { roleId: targetAdmin.id },
      });
      console.log(`  [TX 2/6] Reassigned ${affectedUsers.count} user(s) to Admin role.`);

      // 3. Move approval matrices
      const affectedMatrices = await tx.approvalMatrix.updateMany({
        where: { roleId: superAdminRole.id },
        data: { roleId: targetAdmin.id },
      });
      console.log(`  [TX 3/6] Reassigned ${affectedMatrices.count} approval matrix(es) to Admin role.`);

      // 4. Clone permission relations
      const superAdminPerms = await tx.rolePermission.findMany({
        where: { roleId: superAdminRole.id },
      });
      console.log(`  [TX 4/6] Cloning ${superAdminPerms.length} permission(s) to Admin role...`);
      for (const sap of superAdminPerms) {
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: targetAdmin.id,
              permissionId: sap.permissionId,
            },
          },
          update: {},
          create: {
            roleId: targetAdmin.id,
            permissionId: sap.permissionId,
          },
        });
      }

      // 5. Delete Super Admin permissions
      const deletedPerms = await tx.rolePermission.deleteMany({
        where: { roleId: superAdminRole.id },
      });
      console.log(`  [TX 5/6] Deleted ${deletedPerms.count} legacy Super Admin permission link(s).`);

      // 6. Delete Super Admin role
      await tx.role.delete({
        where: { id: superAdminRole.id },
      });
      console.log(`  [TX 6/6] Deleted legacy "Super Admin" role (ID: ${superAdminRole.id}).`);
    });

    console.log('');
    console.log('=========================================================================');
    console.log('[SUCCESS] Super Admin to Admin migration completed and committed atomically.');
    console.log('All users, matrices, and permissions are consolidated under Admin.');
    console.log('=========================================================================');
  } catch (error) {
    console.error('');
    console.error('=========================================================================');
    console.error('[TRANSACTION ROLLED BACK] Migration failed with error:');
    console.error(`  ${error.message}`);
    console.error('All changes inside the transaction were automatically rolled back.');
    console.error('Database remains untouched.');
    console.error('=========================================================================');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Export for offline testing without side-effects
module.exports = {
  redactDatabaseUrl,
  loadDatabaseConfiguration,
};

if (require.main === module) {
  run();
}
