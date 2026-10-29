import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  isStagingEnvironment,
  assertSafeStagingDatabaseUrl,
  redactDatabaseUrl,
} from '../src/prisma/prisma-database.validator';

export interface SyntheticUserConfig {
  email: string;
  name: string;
  initials: string;
  roleName: string;
  departmentName?: string;
}

export const SYNTHETIC_ROLES = [
  'Admin',
  'Manager',
  'Supervisor',
  'Employee',
  'Viewer',
  'Guest',
];

export const SYNTHETIC_RESOURCES = [
  'Dashboard',
  'Projects',
  'Calendar',
  'Tasks',
  'Actions',
  'Escalations',
  'Followups',
  'Legal',
  'Notepad',
  'AdminControl',
];

export const SYNTHETIC_ACTIONS = [
  'View',
  'Create',
  'Edit',
  'Delete',
  'Export',
  'Import',
  'Approve',
  'Reject',
  'Assign',
  'Manage',
  'Configure',
  'Audit',
];

export const SYNTHETIC_DEPARTMENTS = [
  'CMD Office',
  'Operations (Staging)',
  'Renewables EPC (Staging)',
];

export const SYNTHETIC_SYSTEM_SETTINGS = [
  {
    key: 'SYSTEM_NAME',
    value: 'HARTEK CMD Office Command Center (Staging)',
    description: 'Global system branding name for staging environment',
  },
  {
    key: 'SESSION_TIMEOUT_MINUTES',
    value: '30',
    description: 'Inactivity duration before session expiry',
  },
  {
    key: 'MAX_LOGIN_ATTEMPTS',
    value: '5',
    description: 'Lock account after consecutive failures',
  },
  {
    key: 'LOCKOUT_DURATION_MINUTES',
    value: '15',
    description: 'Account temporary suspension duration',
  },
];

export const SYNTHETIC_USERS: SyntheticUserConfig[] = [
  {
    email: 'admin@staging.example.com',
    name: 'Staging Administrator',
    initials: 'SA',
    roleName: 'Admin',
    departmentName: 'CMD Office',
  },
  {
    email: 'manager@staging.example.com',
    name: 'Staging Manager',
    initials: 'SM',
    roleName: 'Manager',
    departmentName: 'Operations (Staging)',
  },
  {
    email: 'supervisor@staging.example.com',
    name: 'Staging Supervisor',
    initials: 'SS',
    roleName: 'Supervisor',
    departmentName: 'Operations (Staging)',
  },
  {
    email: 'employee@staging.example.com',
    name: 'Staging Employee',
    initials: 'SE',
    roleName: 'Employee',
    departmentName: 'Renewables EPC (Staging)',
  },
  {
    email: 'viewer@staging.example.com',
    name: 'Staging Viewer',
    initials: 'SV',
    roleName: 'Viewer',
  },
];

export function validateStagingSeedEnvironment(env: NodeJS.ProcessEnv = process.env): {
  validatedUrl: URL;
  adminPassword: string;
} {
  // 1. Strictly require staging environment indicator
  if (!isStagingEnvironment(env)) {
    throw new Error(
      '[CRITICAL STAGING SEED FAILURE] seed.staging.ts can ONLY be executed in a verified staging environment (APP_ENV=staging, DEPLOY_ENV=staging, or STAGING=true). Refusing execution.',
    );
  }

  // 2. Validate database safety and isolation
  const validatedUrl = assertSafeStagingDatabaseUrl(env.DATABASE_URL, env);

  // 3. Validate administrator password requirements
  const adminPassword = (env.STAGING_ADMIN_PASSWORD || '').trim();
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error(
      '[CRITICAL STAGING SEED FAILURE] STAGING_ADMIN_PASSWORD environment variable is required and must be at least 12 characters. Refusing to seed administrator account with an insecure or missing password.',
    );
  }

  // 4. Verify all synthetic user emails use reserved non-production domains
  for (const user of SYNTHETIC_USERS) {
    const emailDomain = user.email.split('@')[1]?.toLowerCase();
    if (!emailDomain || (!emailDomain.endsWith('example.com') && !emailDomain.endsWith('staging.local'))) {
      throw new Error(
        `[CRITICAL STAGING SEED FAILURE] Synthetic user email "${user.email}" must use a reserved non-production domain (@example.com or @staging.local). Production domains are strictly forbidden.`,
      );
    }
  }

  return { validatedUrl, adminPassword };
}

export async function runStagingSeed(
  prismaClient: any,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ rolesCount: number; permissionsCount: number; usersCount: number }> {
  const { validatedUrl, adminPassword } = validateStagingSeedEnvironment(env);
  console.log(`[STAGING SEED] Target database: ${redactDatabaseUrl(validatedUrl.toString())}`);

  // Disable outbound emails explicitly
  env.DISABLE_OUTBOUND_EMAILS = 'true';

  // 1. Seed System Settings (skip duplicates, never overwrite custom edits)
  await prismaClient.systemSetting.createMany({
    data: SYNTHETIC_SYSTEM_SETTINGS,
    skipDuplicates: true,
  });

  // 2. Seed Synthetic Departments
  const departmentsMap: Record<string, any> = {};
  for (const deptName of SYNTHETIC_DEPARTMENTS) {
    let dept = await prismaClient.department.findFirst({ where: { name: deptName } });
    if (!dept) {
      dept = await prismaClient.department.create({ data: { name: deptName } });
    }
    departmentsMap[deptName] = dept;
  }

  // 3. Seed Roles
  const rolesMap: Record<string, any> = {};
  for (const name of SYNTHETIC_ROLES) {
    rolesMap[name] = await prismaClient.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // 4. Seed Permissions Matrix
  const permissionsList: Array<{ action: string; resource: string }> = [];
  for (const res of SYNTHETIC_RESOURCES) {
    for (const act of SYNTHETIC_ACTIONS) {
      permissionsList.push({ action: act, resource: res });
    }
  }

  await prismaClient.permission.createMany({
    data: permissionsList,
    skipDuplicates: true,
  });

  const dbPermissions = await prismaClient.permission.findMany();

  // 5. Build RolePermission relations
  const rolePermissionRelations: Array<{ roleId: string; permissionId: string }> = [];

  // Admin gets all permissions
  dbPermissions.forEach((p: any) => {
    rolePermissionRelations.push({ roleId: rolesMap['Admin'].id, permissionId: p.id });
  });

  // Manager gets business permissions (no AdminControl) + Delete on Notepad
  dbPermissions.forEach((p: any) => {
    if (
      p.resource !== 'AdminControl' &&
      ['View', 'Create', 'Edit', 'Export', 'Approve', 'Reject', 'Assign'].includes(p.action)
    ) {
      rolePermissionRelations.push({ roleId: rolesMap['Manager'].id, permissionId: p.id });
    } else if (p.resource === 'Notepad' && p.action === 'Delete') {
      rolePermissionRelations.push({ roleId: rolesMap['Manager'].id, permissionId: p.id });
    }
  });

  // Supervisor & Employee get View, Create, Edit, Export + Delete on Notepad
  dbPermissions.forEach((p: any) => {
    if (
      p.resource !== 'AdminControl' &&
      ['View', 'Create', 'Edit', 'Export'].includes(p.action)
    ) {
      rolePermissionRelations.push({ roleId: rolesMap['Supervisor'].id, permissionId: p.id });
      rolePermissionRelations.push({ roleId: rolesMap['Employee'].id, permissionId: p.id });
    } else if (p.resource === 'Notepad' && p.action === 'Delete') {
      rolePermissionRelations.push({ roleId: rolesMap['Supervisor'].id, permissionId: p.id });
      rolePermissionRelations.push({ roleId: rolesMap['Employee'].id, permissionId: p.id });
    }
  });

  // Viewer gets View on all non-AdminControl
  dbPermissions.forEach((p: any) => {
    if (p.action === 'View' && p.resource !== 'AdminControl') {
      rolePermissionRelations.push({ roleId: rolesMap['Viewer'].id, permissionId: p.id });
    }
  });

  // Guest gets View on Dashboard
  dbPermissions.forEach((p: any) => {
    if (p.action === 'View' && p.resource === 'Dashboard') {
      rolePermissionRelations.push({ roleId: rolesMap['Guest'].id, permissionId: p.id });
    }
  });

  await prismaClient.rolePermission.createMany({
    data: rolePermissionRelations,
    skipDuplicates: true,
  });

  // 6. Seed Synthetic User Accounts
  const saltRounds = 10;
  const adminPasswordHash = await bcrypt.hash(adminPassword, saltRounds);
  const testPassword = env.STAGING_TEST_PASSWORD || adminPassword;
  const testPasswordHash =
    testPassword === adminPassword
      ? adminPasswordHash
      : await bcrypt.hash(testPassword, saltRounds);

  for (const u of SYNTHETIC_USERS) {
    const isSA = u.roleName === 'Admin';
    const pwdHash = isSA ? adminPasswordHash : testPasswordHash;
    const deptId = u.departmentName ? departmentsMap[u.departmentName]?.id : null;

    await prismaClient.user.upsert({
      where: { email: u.email },
      update: {
        roleId: rolesMap[u.roleName]?.id,
        active: true,
      },
      create: {
        email: u.email,
        name: u.name,
        initials: u.initials,
        passwordHash: pwdHash,
        roleId: rolesMap[u.roleName]?.id,
        departmentId: deptId,
        active: true,
      },
    });
  }

  console.log('[STAGING SEED SUCCESS] Synthetic roles, permissions, departments, and users initialized.');
  return {
    rolesCount: SYNTHETIC_ROLES.length,
    permissionsCount: dbPermissions.length,
    usersCount: SYNTHETIC_USERS.length,
  };
}

// Auto-run if executed directly via CLI
if (require.main === module) {
  const { validatedUrl } = validateStagingSeedEnvironment(process.env);
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: validatedUrl.toString(),
      },
    },
  });

  runStagingSeed(prisma, process.env)
    .catch((err) => {
      console.error('[STAGING SEED FATAL ERROR]', err.message);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
