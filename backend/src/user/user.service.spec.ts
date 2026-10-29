import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { UserService } from './user.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsMailer } from '../settings/settings.mailer';
import { SettingsService } from '../settings/settings.service';
import { sanitizeAuditPayload, REDACTED_MARKER } from '../audit/audit-sanitizer';

describe('UserService Logging Safeguards and Secret Redaction Tests', () => {
  let userService: UserService;
  let mockPrismaService: any;
  let mockSettingsMailer: any;
  let mockSettingsService: any;

  beforeEach(async () => {
    mockPrismaService = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    };

    mockSettingsMailer = {
      sendTemplateEmail: jest.fn().mockResolvedValue(true),
    };

    mockSettingsService = {
      getAllSettings: jest.fn().mockResolvedValue({
        support_email: 'support@hartek.com',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SettingsMailer, useValue: mockSettingsMailer },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    userService = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Temporary Password Reset Logging Safeguards', () => {
    it('should NEVER log plaintext temporary password, key label, or email PII during admin password reset', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

      const mockUser = {
        id: 'usr-target-12345',
        name: 'Target Employee',
        email: 'confidential.employee@hartek.com',
        active: true,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      const result = await userService.resetPasswordTemp(mockUser.id);

      // Verify business behavior is preserved
      expect(result.success).toBe(true);
      expect(result.tempPassword).toBeDefined();
      expect(typeof result.tempPassword).toBe('string');
      expect(result.tempPassword.length).toBeGreaterThanOrEqual(8);
      expect(result.emailSent).toBe(true);

      // Verify DB was updated with requiresPasswordReset flag
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: expect.objectContaining({
            requiresPasswordReset: true,
            passwordHash: expect.any(String),
          }),
        }),
      );

      // Verify logs: MUST NOT leak the temporary password, key label, or user email
      const loggedMessages = logSpy.mock.calls.map((c) => String(c[0]));
      const tempResetLog = loggedMessages.find((m) => m.includes('[TEMP PASSWORD RESET]'));

      expect(tempResetLog).toBeDefined();
      expect(tempResetLog).toContain(mockUser.id);
      expect(tempResetLog).not.toContain(result.tempPassword);
      expect(tempResetLog).not.toContain('Key:');
      expect(tempResetLog).not.toContain(mockUser.email);
    });
  });

  describe('User Creation Onboarding Email Logging Safeguards', () => {
    it('should log safe operational audit event without exposing recipient email address or passwords', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

      const createUserDto = {
        email: 'newhire.confidential@hartek.com',
        name: 'New Hire Person',
        roleId: 'role-emp-1',
      };

      const createdUserRecord = {
        id: 'usr-new-98765',
        email: createUserDto.email,
        name: createUserDto.name,
        roleId: createUserDto.roleId,
        active: true,
        requiresPasswordReset: true,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(createdUserRecord);

      const created = await userService.create(createUserDto);

      expect(created.id).toBe(createdUserRecord.id);

      // Verify logs: MUST NOT leak recipient email
      const loggedMessages = logSpy.mock.calls.map((c) => String(c[0]));
      const userCreationLog = loggedMessages.find((m) => m.includes('[USER CREATION EMAIL]'));

      expect(userCreationLog).toBeDefined();
      expect(userCreationLog).toContain(createdUserRecord.id);
      expect(userCreationLog).not.toContain(createUserDto.email);
    });
  });

  describe('Audit Log Leakage Prevention (Regression Tests)', () => {
    it('should verify resetPasswordTemp response passed through sanitizeAuditPayload has secret absent from EVERY field', async () => {
      const mockUser = {
        id: 'usr-audit-safe-001',
        name: 'Audit Safe Employee',
        email: 'audit.safe@hartek.local',
        active: true,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      // Scenario A: Email successfully sent
      const successResult = await userService.resetPasswordTemp(mockUser.id);
      expect(successResult.message).not.toContain(successResult.tempPassword);

      // Pass through sanitizeAuditPayload (simulating AuditInterceptor runtime capture: const newFiltered = candidateNew ? sanitizeAuditPayload(candidateNew) : null)
      const sanitizedSuccess = sanitizeAuditPayload(successResult);

      expect(sanitizedSuccess.tempPassword).toBe(REDACTED_MARKER);
      expect(sanitizedSuccess.message).not.toContain(successResult.tempPassword);
      expect(JSON.stringify(sanitizedSuccess)).not.toContain(successResult.tempPassword);

      // Scenario B: Email delivery failed / suppressed
      mockSettingsMailer.sendTemplateEmail.mockResolvedValueOnce(false);
      const failResult = await userService.resetPasswordTemp(mockUser.id);
      expect(failResult.emailSent).toBe(false);
      expect(failResult.message).not.toContain(failResult.tempPassword);

      const sanitizedFail = sanitizeAuditPayload(failResult);
      expect(sanitizedFail.tempPassword).toBe(REDACTED_MARKER);
      expect(sanitizedFail.message).not.toContain(failResult.tempPassword);
      expect(JSON.stringify(sanitizedFail)).not.toContain(failResult.tempPassword);
    });
  });

  describe('findAll() Role Isolation & Legacy Super Admin Leakage Prevention', () => {
    it('excludes both canonical "Admin" and legacy "Super Admin" accounts when queried by an Employee', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await userService.findAll('Employee');

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            role: {
              name: { notIn: ['Admin', 'Super Admin'] },
            },
          },
        }),
      );
    });

    it('excludes both "Admin" and "Super Admin" accounts when queried by a Manager', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await userService.findAll('Manager');

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            role: {
              name: { notIn: ['Admin', 'Super Admin'] },
            },
          },
        }),
      );
    });

    it('does not filter out administrators when queried by a canonical "Admin"', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await userService.findAll('Admin');

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });

    it('does not filter out administrators when queried by a legacy "Super Admin"', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await userService.findAll('Super Admin');

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        }),
      );
    });
  });
});
