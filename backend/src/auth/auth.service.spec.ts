import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsMailer } from '../settings/settings.mailer';
import { SettingsService } from '../settings/settings.service';
import * as bcrypt from 'bcrypt';

describe('AuthService Secret Logging and Response Sanitization Tests', () => {
  let authService: AuthService;
  let mockPrismaService: any;
  let mockJwtService: any;
  let mockSettingsMailer: any;
  let mockSettingsService: any;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.DISABLE_OUTBOUND_EMAILS;
    delete process.env.APP_ENV;
    delete process.env.DEPLOY_ENV;
    delete process.env.STAGING;

    mockPrismaService = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      userSessionLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      deviceTrack: {
        upsert: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      loginHistory: {
        create: jest.fn().mockResolvedValue({}),
      },
      session: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
    };

    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    };

    mockSettingsMailer = {
      sendTemplateEmail: jest.fn().mockResolvedValue(true),
      sendEmail: jest.fn().mockResolvedValue(true),
    };

    mockSettingsService = {
      getAllSettings: jest.fn().mockResolvedValue({
        support_email: 'support@hartek.com',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: SettingsMailer, useValue: mockSettingsMailer },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  describe('MFA OTP Logging Safeguards', () => {
    it('should NEVER log raw MFA OTP code or email PII when MFA challenge is initiated', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

      const mockUser = {
        id: 'usr-mfa-123',
        email: 'confidential.employee@hartek.com',
        passwordHash: await bcrypt.hash('CorrectPassword123!', 10),
        mfaEnabled: true,
        active: true,
        deletedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result: any = await authService.validateUser(
        { email: mockUser.email, password: 'CorrectPassword123!' },
        '192.168.1.100',
        'Mozilla/5.0 Chrome',
      );

      expect(result.mfaRequired).toBe(true);
      expect(result.email).toBe(mockUser.email);

      // Verify that user record in DB was updated with a 6-digit OTP
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: expect.objectContaining({
            otpCode: expect.stringMatching(/^\d{6}$/),
          }),
        }),
      );

      const generatedOtp = mockPrismaService.user.update.mock.calls[0][0].data.otpCode;

      // Verify logs: Operational challenge log must NOT contain the OTP code or user email
      const loggedMessages = logSpy.mock.calls.map((c) => String(c[0]));
      const mfaLog = loggedMessages.find((m) => m.includes('[MFA OTP SENT]'));

      expect(mfaLog).toBeDefined();
      expect(mfaLog).toContain(mockUser.id);
      expect(mfaLog).not.toContain(generatedOtp);
      expect(mfaLog).not.toContain(mockUser.email);
    });
  });

  describe('Password Reset OTP Logging and Response Sanitization', () => {
    it('should NEVER log raw Password Reset OTP code or email PII during forgot-password', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

      const mockUser = {
        id: 'usr-reset-456',
        name: 'Reset Test User',
        email: 'secret.user@hartek.com',
        deletedAt: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await authService.forgotPassword({ email: mockUser.email });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: expect.objectContaining({
            otpCode: expect.stringMatching(/^\d{6}$/),
          }),
        }),
      );

      const generatedOtp = mockPrismaService.user.update.mock.calls[0][0].data.otpCode;

      const loggedMessages = logSpy.mock.calls.map((c) => String(c[0]));
      const resetLog = loggedMessages.find((m) => m.includes('[PASSWORD RESET OTP]'));

      expect(resetLog).toBeDefined();
      expect(resetLog).toContain(mockUser.id);
      expect(resetLog).not.toContain(generatedOtp);
      expect(resetLog).not.toContain(mockUser.email);
    });

    it('should NEVER leak raw OTP code in response message or devOtp when email delivery fails in staging or production', async () => {
      mockSettingsMailer.sendTemplateEmail.mockResolvedValue(false); // Email delivery disabled/failed

      const mockUser = {
        id: 'usr-reset-789',
        name: 'Staging User',
        email: 'staging.user@hartek.com',
        deletedAt: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      // Scenario A: Staging environment via APP_ENV
      process.env.NODE_ENV = 'production';
      process.env.APP_ENV = 'staging';

      const stagingResult = await authService.forgotPassword({ email: mockUser.email });

      expect(stagingResult.success).toBe(true);
      expect(stagingResult.devOtp).toBeUndefined(); // MUST NOT leak devOtp in staging
      expect(stagingResult.message).not.toMatch(/\d{6}/); // MUST NOT embed OTP in message
      expect(stagingResult.message).toBe('If the email address is registered, a password reset OTP code and verification link have been sent.');

      // Scenario B: Explicit production mode
      process.env.NODE_ENV = 'production';
      delete process.env.APP_ENV;

      const prodResult = await authService.forgotPassword({ email: mockUser.email });

      expect(prodResult.success).toBe(true);
      expect(prodResult.devOtp).toBeUndefined(); // MUST NOT leak devOtp in production
      expect(prodResult.message).not.toMatch(/\d{6}/); // MUST NOT embed OTP in message
      expect(prodResult.message).toBe('If the email address is registered, a password reset OTP code and verification link have been sent.');
    });

    it('should return the exact same public message and response structure for unregistered email addresses', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const unregResult = await authService.forgotPassword({ email: 'nonexistent.user@hartek.com' });

      expect(unregResult.success).toBe(true);
      expect(unregResult.devOtp).toBeUndefined();
      expect(unregResult.message).toBe('If the email address is registered, a password reset OTP code and verification link have been sent.');
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
      expect(mockSettingsMailer.sendTemplateEmail).not.toHaveBeenCalled();
    });

    it('should prevent devOtp when DEPLOY_ENV=staging even if NODE_ENV=development', async () => {
      process.env.NODE_ENV = 'development';
      process.env.DEPLOY_ENV = 'staging';
      delete process.env.APP_ENV;
      delete process.env.STAGING;

      const mockUser = {
        id: 'usr-deploy-staging',
        name: 'Deploy Staging User',
        email: 'deploy.staging@hartek.local',
        deletedAt: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await authService.forgotPassword({ email: mockUser.email });

      expect(result.success).toBe(true);
      expect(result.devOtp).toBeUndefined(); // DEPLOY_ENV=staging must block devOtp
      expect(result.message).toBe('If the email address is registered, a password reset OTP code and verification link have been sent.');
    });

    it('should allow devOtp strictly in local development environments only while maintaining uniform public message', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.APP_ENV;
      delete process.env.DEPLOY_ENV;
      delete process.env.STAGING;

      const mockUser = {
        id: 'usr-dev-111',
        name: 'Dev User',
        email: 'dev.user@hartek.local',
        deletedAt: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const devResult = await authService.forgotPassword({ email: mockUser.email });

      expect(devResult.success).toBe(true);
      expect(devResult.devOtp).toBeDefined();
      expect(devResult.devOtp).toMatch(/^\d{6}$/);
      expect(devResult.message).not.toMatch(/\d{6}/); // Message still uniform and sanitized
      expect(devResult.message).toBe('If the email address is registered, a password reset OTP code and verification link have been sent.');
    });
  });

  describe('Account Lockout Logging Sanitization', () => {
    it('should log account lockout using user ID without exposing email address', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

      const mockUser = {
        id: 'usr-lockout-999',
        email: 'targeted.user@hartek.com',
        passwordHash: await bcrypt.hash('CorrectPassword123!', 10),
        active: true,
        deletedAt: null,
        failedLoginAttempts: 4, // 5th failure will trigger lockout
        lockedUntil: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        authService.validateUser(
          { email: mockUser.email, password: 'WrongPassword!' },
          '203.0.113.42',
          'Mozilla/5.0 Firefox',
        ),
      ).rejects.toThrow();

      const warnMessages = warnSpy.mock.calls.map((c) => String(c[0]));
      const lockLog = warnMessages.find((m) => m.includes('[ACCOUNT LOCKED]'));

      expect(lockLog).toBeDefined();
      expect(lockLog).toContain(mockUser.id);
      expect(lockLog).toContain('203.0.113.42');
      expect(lockLog).not.toContain(mockUser.email);
    });
  });
});
