import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertSafeTestDatabaseUrl, APPROVED_TEST_DATABASE_NAME } from './setup-test-db';

describe('Recipient Validation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let cmdToken: string;
  let adminUserId: string;
  let employeeUserId: string;

  beforeAll(async () => {
    try {
      // 1. Mandatory Pre-Flight URL Assertion (verifies protocol, loopback host, approved DB name)
      assertSafeTestDatabaseUrl(process.env.DATABASE_URL);

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

      // 2. Pre-Flight Active DB Connection Check: verify identity BEFORE app.init()
      prisma = moduleFixture.get(PrismaService);
      const dbCheck = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database();`;
      const connectedDb = dbCheck[0]?.current_database;

      if (connectedDb !== APPROVED_TEST_DATABASE_NAME) {
        throw new Error(
          `[CRITICAL TEST DB ISOLATION FAILURE] Active database is "${connectedDb}", expected strictly "${APPROVED_TEST_DATABASE_NAME}". Aborting before app initialization.`
        );
      }

      // 3. Initialize HTTP listeners and lifecycle hooks ONLY after DB is positively verified
      await app.init();

      // 4. Authenticate CMD user
      const cmdLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'cmd@hartek.local', password: 'TestPassword123!' });
      expect(cmdLogin.status).toBe(200);
      cmdToken = cmdLogin.body.accessToken;

      // 5. Fetch user IDs
      const adminUser = await prisma.user.findFirst({ where: { email: 'admin@hartek.local' } });
      const empUser = await prisma.user.findFirst({ where: { email: 'employee@hartek.local' } });
      expect(adminUser).toBeDefined();
      expect(empUser).toBeDefined();
      adminUserId = adminUser!.id;
      employeeUserId = empUser!.id;
    } catch (error) {
      if (app) {
        try {
          await app.close();
        } catch {
          // Safe cleanup: do not mask the original setup failure
        }
      } else if (prisma) {
        try {
          await prisma.$disconnect();
        } catch {
          // Safe cleanup: do not mask the original setup failure
        }
      }
      throw error;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. Task Assignee Validation', () => {
    it('Rejects task creation with Admin user ID -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          title: 'Admin Assigned Task',
          pri: 'High',
          st: 'Open',
          assigneeIds: [adminUserId],
        })
        .expect(400);

      expect(res.body.message).toContain('Tasks cannot be assigned to Administrator accounts');
    });

    it('Rejects task creation with non-existent user ID -> 400 Bad Request', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000099';
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          title: 'Fake User Task',
          pri: 'Medium',
          st: 'Open',
          assigneeIds: [fakeUuid],
        })
        .expect(400);

      expect(res.body.message).toContain('not found in the system');
    });

    it('Rejects task creation with malformed user ID -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          title: 'Malformed ID Task',
          pri: 'Medium',
          st: 'Open',
          assigneeIds: ['invalid-non-uuid-string'],
        })
        .expect(400);

      expect(res.body.message).toContain('not a valid UUID format');
    });

    it('Accepts task creation with valid employee user ID -> 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          title: 'Valid Employee Task',
          pri: 'Medium',
          st: 'Open',
          assigneeIds: [employeeUserId],
        })
        .expect(201);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].id).toBeDefined();
      expect(res.body[0].assigneeId).toBe(employeeUserId);
    });

    it('Atomic Batch Creation: if any task in multi-record has invalid recipient, rollback all -> 400 Bad Request', async () => {
      const countBefore = await prisma.task.count();

      const res = await request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          title: 'Batch Parent Task',
          pri: 'High',
          st: 'Open',
          assigneeIds: [employeeUserId, adminUserId],
        })
        .expect(400);

      expect(res.body.message).toContain('Tasks cannot be assigned to Administrator accounts');

      // Database assertion: NO tasks were created
      const countAfter = await prisma.task.count();
      expect(countAfter).toBe(countBefore);
    });
  });

  describe('2. Escalation Recipient Validation', () => {
    it('Rejects escalation with Admin user ID in assignedTo array -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/escalations')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          type: 'Operational',
          sev: 'High',
          proj: 'Alpha Project',
          st: 'In Progress',
          assignedTo: [adminUserId],
        })
        .expect(400);

      expect(res.body.message).toContain('cannot be assigned to Administrator accounts');
    });

    it('Rejects escalation with Admin email (case-insensitive) in assignedTo -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/escalations')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          type: 'Commercial',
          sev: 'Critical',
          proj: 'Beta Project',
          st: 'In Progress',
          assignedTo: ['ADMIN@HARTEK.LOCAL'],
        })
        .expect(400);

      expect(res.body.message).toContain('cannot be assigned to Administrator accounts');
    });

    it('Accepts escalation with external email and valid employee ID -> 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/escalations')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          type: 'Operational',
          sev: 'Medium',
          proj: 'Gamma Project',
          st: 'In Progress',
          assignedTo: [employeeUserId, 'external.vendor@partner.org'],
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      const recipients = Array.isArray(res.body.assignedTo)
        ? res.body.assignedTo
        : JSON.parse(res.body.assignedTo);
      expect(recipients).toContain(employeeUserId);
      expect(recipients).toContain('external.vendor@partner.org');
    });

    it('Deduplicates repeated user IDs in assignedTo without error -> 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/escalations')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          type: 'Technical',
          sev: 'Medium',
          proj: 'Delta Project',
          st: 'In Progress',
          assignedTo: [employeeUserId, employeeUserId],
        })
        .expect(201);

      const recipients = Array.isArray(res.body.assignedTo)
        ? res.body.assignedTo
        : JSON.parse(res.body.assignedTo);
      expect(recipients.filter((id: string) => id === employeeUserId).length).toBe(1);
    });

    it('Preserves existing assignedTo on update when field is omitted', async () => {
      // Create with employee
      const created = await request(app.getHttpServer())
        .post('/escalations')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          type: 'Regulatory',
          sev: 'Medium',
          proj: 'Omission Test Proj',
          st: 'In Progress',
          assignedTo: [employeeUserId],
        })
        .expect(201);

      // Update WITHOUT assignedTo field
      const updated = await request(app.getHttpServer())
        .put(`/escalations/${created.body.id}`)
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          type: 'Regulatory',
          sev: 'High',
          proj: 'Omission Test Proj Updated',
          st: 'In Progress',
        })
        .expect(200);

      const recipients = Array.isArray(updated.body.assignedTo)
        ? updated.body.assignedTo
        : JSON.parse(updated.body.assignedTo);
      expect(recipients).toContain(employeeUserId);
    });
  });

  describe('3. Action Item Recipient Validation', () => {
    it('Rejects Action Item with Admin user ID in assignedTo -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/action-items')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          item: 'Action for Admin',
          own: 'Employee',
          pri: 'High',
          st: 'Open',
          assignedTo: [adminUserId],
        })
        .expect(400);

      expect(res.body.message).toContain('cannot be assigned to Administrator accounts');
    });

    it('Accepts Action Item with valid employee ID and external email -> 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/action-items')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          item: 'Valid Action Item',
          own: 'Employee',
          pri: 'Medium',
          st: 'Open',
          assignedTo: [employeeUserId, 'consultant@external.com'],
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
    });
  });

  describe('4. Follow-Up Recipient Validation', () => {
    it('Rejects Follow-Up with Admin email in assignedTo -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/follow-ups')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          proj: 'FollowUp Proj',
          priority: 'High',
          st: 'Open',
          assignedTo: ['admin@hartek.local'],
        })
        .expect(400);

      expect(res.body.message).toContain('cannot be assigned to Administrator accounts');
    });

    it('Accepts Follow-Up with valid employee and external email -> 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/follow-ups')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          proj: 'FollowUp Proj Valid',
          priority: 'Medium',
          st: 'Open',
          assignedTo: [employeeUserId, 'vendor.ops@thirdparty.com'],
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
    });
  });

  describe('5. Meeting Attendees Validation', () => {
    it('Rejects Meeting when attendees string contains Admin account email -> 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          name: 'Executive Review',
          cat: 'review',
          status: 'scheduled',
          date: '2026-11-01',
          attendees: 'John Doe, admin@hartek.local, Jane Smith',
        })
        .expect(400);

      expect(res.body.message).toContain('System Administrator accounts cannot be added as meeting attendees');
    });

    it('Does NOT reject ordinary text names containing "Admin" like "Administration Office" -> 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          name: 'General Staff Sync',
          cat: 'other',
          status: 'scheduled',
          date: '2026-11-02',
          attendees: 'Administration Office, Project Team, Dr. Administrator',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.attendees).toContain('Administration Office');
      expect(res.body.attendees).toContain('Dr. Administrator');
    });

    it('Accepts Meeting with employee user ID and external email in attendees -> 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/meetings')
        .set('Authorization', `Bearer ${cmdToken}`)
        .send({
          name: 'Vendor Coordination Sync',
          cat: 'vendor',
          status: 'scheduled',
          date: '2026-11-03',
          attendees: `${employeeUserId}, auditor@firm.com, Client Lead`,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.attendees).toContain(employeeUserId);
      expect(res.body.attendees).toContain('auditor@firm.com');
    });
  });
});
