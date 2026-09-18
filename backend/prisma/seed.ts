import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // -------------------------------------------------------------------------
  // 1. SYSTEM SETTINGS & FEATURE FLAGS
  // -------------------------------------------------------------------------
  await prisma.systemSetting.createMany({
    data: [
      { key: 'SYSTEM_NAME', value: 'HARTEK CMD Office Command Center', description: 'Global system branding name' },
      { key: 'SESSION_TIMEOUT_MINUTES', value: '30', description: 'Inactivity duration before session expiry' },
      { key: 'MAX_LOGIN_ATTEMPTS', value: '5', description: 'Lock account after consecutive failures' },
      { key: 'LOCKOUT_DURATION_MINUTES', value: '15', description: 'Account temporary suspension duration' },
    ],
    skipDuplicates: true,
  });

  // -------------------------------------------------------------------------
  // 2. MASTER DEPARTMENTS
  // -------------------------------------------------------------------------
  const deptNames = [
    'PS-IPP/Utility',      // Power Systems — IPP / Utility
    'PS-Ind',              // Power Systems — Industry
    'Renewables LB EPC',   // Renewables — LB EPC
    'Renewables C&I',      // Renewables — C&I
    'Amtek',
    'PDP',                 // Power Distribution Products
    'CMD Office',
  ];

  const depts: Record<string, any> = {};
  for (const dName of deptNames) {
    let existing = await prisma.department.findFirst({ where: { name: dName } });
    if (!existing) {
      existing = await prisma.department.create({ data: { name: dName } });
    }
    depts[dName] = existing;
  }

  // -------------------------------------------------------------------------
  // 3. ROLES AND PERMISSIONS (RBAC)
  // -------------------------------------------------------------------------
  const roleNames = ['Admin', 'Manager', 'Supervisor', 'Employee', 'Viewer', 'Guest'];
  const roles: Record<string, any> = {};
  for (const name of roleNames) {
    roles[name] = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const resources = ['Dashboard', 'Projects', 'Calendar', 'Tasks', 'Actions', 'Escalations', 'Followups', 'Legal', 'Notepad', 'AdminControl'];
  const actions = ['View', 'Create', 'Edit', 'Delete', 'Export', 'Import', 'Approve', 'Reject', 'Assign', 'Manage', 'Configure', 'Audit'];

  console.log('Generating granular permissions matrix...');
  const permissionsList: any[] = [];
  for (const res of resources) {
    for (const act of actions) {
      permissionsList.push({ action: act, resource: res });
    }
  }

  // Create permissions
  await prisma.permission.createMany({
    data: permissionsList,
    skipDuplicates: true,
  });

  const dbPermissions = await prisma.permission.findMany();

  // Create permissions link
  console.log('Linking RolePermissions...');
  const rolePermissionRelations: any[] = [];

  // Admin: gets all permissions
  dbPermissions.forEach(p => {
    rolePermissionRelations.push({ roleId: roles['Admin'].id, permissionId: p.id });
  });

  // Manager: View, Create, Edit, Export, Approve, Reject on all business items. No AdminControl. Plus Delete on Notepad.
  dbPermissions.forEach(p => {
    if (p.resource !== 'AdminControl' && ['View', 'Create', 'Edit', 'Export', 'Approve', 'Reject', 'Assign'].includes(p.action)) {
      rolePermissionRelations.push({ roleId: roles['Manager'].id, permissionId: p.id });
    } else if (p.resource === 'Notepad' && p.action === 'Delete') {
      rolePermissionRelations.push({ roleId: roles['Manager'].id, permissionId: p.id });
    }
  });

  // Supervisor: View, Create, Edit on business items. Plus Delete on Notepad.
  dbPermissions.forEach(p => {
    if (p.resource !== 'AdminControl' && ['View', 'Create', 'Edit', 'Export'].includes(p.action)) {
      rolePermissionRelations.push({ roleId: roles['Supervisor'].id, permissionId: p.id });
    } else if (p.resource === 'Notepad' && p.action === 'Delete') {
      rolePermissionRelations.push({ roleId: roles['Supervisor'].id, permissionId: p.id });
    }
  });

  // Employee: View, Create, Edit, and Export on all business items (Projects, Calendar, Tasks, Actions, Escalations, Followups, Legal, Notepad). Plus Delete on Notepad.
  dbPermissions.forEach(p => {
    if (p.resource !== 'AdminControl' && ['View', 'Create', 'Edit', 'Export'].includes(p.action)) {
      rolePermissionRelations.push({ roleId: roles['Employee'].id, permissionId: p.id });
    } else if (p.resource === 'Notepad' && p.action === 'Delete') {
      rolePermissionRelations.push({ roleId: roles['Employee'].id, permissionId: p.id });
    }
  });

  // Viewer: View-only access
  dbPermissions.forEach(p => {
    if (p.action === 'View' && p.resource !== 'AdminControl') {
      rolePermissionRelations.push({ roleId: roles['Viewer'].id, permissionId: p.id });
    }
  });

  // Guest: View dashboard only
  dbPermissions.forEach(p => {
    if (p.action === 'View' && p.resource === 'Dashboard') {
      rolePermissionRelations.push({ roleId: roles['Guest'].id, permissionId: p.id });
    }
  });

  await prisma.rolePermission.createMany({
    data: rolePermissionRelations,
    skipDuplicates: true,
  });

  // -------------------------------------------------------------------------
  // 4. USER ACCOUNTS (Matching CMD dashboard profiles)
  // -------------------------------------------------------------------------
  console.log('Seeding initial user profiles...');
  const saltRounds = 10;
  const commonPasswordHash = await bcrypt.hash('hartek123', saltRounds);

  const usersList = [
    {
      email: 'cmd@hartek.com',
      name: 'CMD / Chairman',
      initials: 'CMD',
      passwordHash: commonPasswordHash,
      roleId: roles['Manager'].id,
      departmentId: depts['CMD Office'].id,
    },
    {
      email: 'ea@hartek.com',
      name: 'EA | Head Corporate Affairs',
      initials: 'EA',
      passwordHash: commonPasswordHash,
      roleId: roles['Supervisor'].id,
      departmentId: depts['CMD Office'].id,
    },
    {
      email: 'executive@hartek.com',
      name: 'Executive | CMD Office',
      initials: 'EX',
      passwordHash: commonPasswordHash,
      roleId: roles['Employee'].id,
      departmentId: depts['CMD Office'].id,
    },
    {
      email: 'viewer@hartek.com',
      name: 'View Only',
      initials: 'VO',
      passwordHash: commonPasswordHash,
      roleId: roles['Viewer'].id,
      departmentId: null,
    },
    {
      email: 'project-ops@hartek.com',
      name: 'System Administrator',
      initials: 'AD',
      passwordHash: await bcrypt.hash(process.env.ADMIN_INITIAL_PASSWORD || 'ChangeMeAdmin@2026!', 10),
      roleId: roles['Admin'].id,
      departmentId: depts['CMD Office'].id,
    },
  ];

  const createdUsers: Record<string, any> = {};
  for (const u of usersList) {
    createdUsers[u.initials] = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        roleId: u.roleId,
      },
      create: {
        email: u.email,
        name: u.name,
        initials: u.initials,
        passwordHash: u.passwordHash,
        roleId: u.roleId,
        departmentId: u.departmentId,
        active: true,
      },
    });
  }

  // -------------------------------------------------------------------------
  // 6. MASTER HUMAN RESOURCES (Designations & Employees)
  // -------------------------------------------------------------------------
  const desigChairman = await prisma.designation.upsert({
    where: { name: 'Chairman & Managing Director' },
    update: {},
    create: { name: 'Chairman & Managing Director' },
  });

  const desigEA = await prisma.designation.upsert({
    where: { name: 'EA — Head Corporate Affairs' },
    update: {},
    create: { name: 'EA — Head Corporate Affairs' },
  });

  const desigExec = await prisma.designation.upsert({
    where: { name: 'Executive — CMD Office' },
    update: {},
    create: { name: 'Executive — CMD Office' },
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
