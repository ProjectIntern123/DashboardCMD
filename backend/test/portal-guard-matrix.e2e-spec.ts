import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertSafeTestDatabaseUrl, APPROVED_TEST_DATABASE_NAME } from './setup-test-db';

describe('Portal Guard Matrix (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let cmdToken: string;
  let employeeToken: string;

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
      console.log(`[TEST MATRIX] Verified active DB connection: ${connectedDb}`);

      if (connectedDb !== APPROVED_TEST_DATABASE_NAME) {
        throw new Error(
          `[CRITICAL TEST DB ISOLATION FAILURE] Active database is "${connectedDb}", expected strictly "${APPROVED_TEST_DATABASE_NAME}". Aborting before app initialization.`
        );
      }

      // 3. Initialize HTTP listeners and lifecycle hooks ONLY after DB is positively verified
      await app.init();

      // 4. Authenticate test users
      const adminLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'admin@hartek.local', password: 'TestPassword123!' });
      expect(adminLogin.status).toBe(200);
      adminToken = adminLogin.body.accessToken;

      const cmdLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'cmd@hartek.local', password: 'TestPassword123!' });
      expect(cmdLogin.status).toBe(200);
      cmdToken = cmdLogin.body.accessToken;

      const empLogin = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'employee@hartek.local', password: 'TestPassword123!' });
      expect(empLogin.status).toBe(200);
      employeeToken = empLogin.body.accessToken;
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

  describe('1. Unauthenticated Access', () => {
    it('GET /roles (Admin route) -> 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/roles')
        .expect(401);
    });

    it('GET /tasks (User route) -> 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/tasks')
        .expect(401);
    });

    it('GET /settings/public (Public route) -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/settings/public')
        .expect(200);
      expect(typeof res.body).toBe('object');
    });
  });

  describe('2. Admin Access to Admin Portal', () => {
    it('Admin GET /roles -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/roles')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('Admin GET /roles/permissions -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/roles/permissions')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('Admin GET /settings -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(typeof res.body).toBe('object');
    });

    it('Admin GET /audit-logs -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toHaveProperty('logs');
    });

    it('Admin GET /email-templates -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/email-templates')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('3. Admin Rejection from User Portal Business APIs (403 Forbidden)', () => {
    it('Admin GET /tasks -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
      expect(res.body.message).toContain('Administrators cannot access business workflow endpoints');
    });

    it('Admin GET /projects -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
      expect(res.body.message).toContain('Administrators cannot access business workflow endpoints');
    });

    it('Admin GET /meetings -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
      expect(res.body.message).toContain('Administrators cannot access business workflow endpoints');
    });

    it('Admin GET /action-items -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/action-items')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
      expect(res.body.message).toContain('Administrators cannot access business workflow endpoints');
    });

    it('Admin GET /escalations -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/escalations')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
      expect(res.body.message).toContain('Administrators cannot access business workflow endpoints');
    });

    it('Admin GET /follow-ups -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/follow-ups')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
      expect(res.body.message).toContain('Administrators cannot access business workflow endpoints');
    });

    it('Admin GET /legal-cases -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/legal-cases')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
      expect(res.body.message).toContain('Administrators cannot access business workflow endpoints');
    });

    it('Admin GET /notepad -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/notepad')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
      expect(res.body.message).toContain('Administrators cannot access business workflow endpoints');
    });

    it('Admin GET /dashboard/stats -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
      expect(res.body.message).toContain('Administrators cannot access business workflow endpoints');
    });
  });

  describe('4. Non-Admin Rejection from Admin Portal APIs (403 Forbidden)', () => {
    it('Employee GET /roles -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/roles')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
      expect(res.body.message).toContain('Access restricted to Admin portal users only');
    });

    it('Employee GET /settings -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/settings')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
      expect(res.body.message).toContain('Access restricted to Admin portal users only');
    });

    it('Employee GET /audit-logs -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/audit-logs')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
      expect(res.body.message).toContain('Access restricted to Admin portal users only');
    });

    it('Employee GET /email-templates -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/email-templates')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(403);
      expect(res.body.message).toContain('Access restricted to Admin portal users only');
    });

    it('CMD GET /roles -> 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/roles')
        .set('Authorization', `Bearer ${cmdToken}`)
        .expect(403);
      expect(res.body.message).toContain('Access restricted to Admin portal users only');
    });
  });

  describe('5. Shared Endpoints Behavior', () => {
    it('Admin GET /auth/me -> 200 OK with Admin role', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.email).toBe('admin@hartek.local');
      expect(res.body.role).toBe('Admin');
    });

    it('Employee GET /auth/me -> 200 OK with Employee role', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(res.body.email).toBe('employee@hartek.local');
      expect(res.body.role).toBe('Employee');
    });

    it('Admin GET /users -> 200 OK with Admin account included in list', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const adminInList = res.body.find((u: any) => u.email === 'admin@hartek.local');
      expect(adminInList).toBeDefined();
    });

    it('Non-Admin (Employee) GET /users -> 200 OK with Admin accounts EXCLUDED', async () => {
      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const adminInList = res.body.find((u: any) =>
        u.email === 'admin@hartek.local' || (u.role && (u.role.name === 'Admin' || u.role === 'Admin'))
      );
      expect(adminInList).toBeUndefined();
    });
  });

  describe('6. Non-Admin Authorized Access to User Portal Business APIs', () => {
    it('CMD GET /tasks -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${cmdToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('CMD GET /projects -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/projects')
        .set('Authorization', `Bearer ${cmdToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('CMD GET /meetings -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/meetings')
        .set('Authorization', `Bearer ${cmdToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('CMD GET /action-items -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/action-items')
        .set('Authorization', `Bearer ${cmdToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('CMD GET /escalations -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/escalations')
        .set('Authorization', `Bearer ${cmdToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('CMD GET /follow-ups -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/follow-ups')
        .set('Authorization', `Bearer ${cmdToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('CMD GET /legal-cases -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/legal-cases')
        .set('Authorization', `Bearer ${cmdToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('CMD GET /notepad -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/notepad')
        .set('Authorization', `Bearer ${cmdToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('CMD GET /dashboard/stats -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/stats')
        .set('Authorization', `Bearer ${cmdToken}`)
        .expect(200);
      expect(typeof res.body).toBe('object');
    });
  });
});
