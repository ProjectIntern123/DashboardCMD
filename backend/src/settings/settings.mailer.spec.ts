import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SettingsMailer } from './settings.mailer';
import { SettingsService } from './settings.service';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('SettingsMailer Security & Recipient Routing Tests', () => {
  let mailer: SettingsMailer;
  let mockSettingsService: any;
  let mockEmailTemplatesService: any;
  let mockSendMail: jest.Mock;
  let mockVerify: jest.Mock;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Restore environment variables before each test
    process.env = { ...originalEnv };
    delete process.env.DISABLE_OUTBOUND_EMAILS;
    delete process.env.APP_ENV;
    delete process.env.DEPLOY_ENV;
    delete process.env.STAGING;
    delete process.env.ALLOW_OUTBOUND_EMAILS;
    delete process.env.ENABLE_STAGING_OUTBOUND_EMAILS;

    mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });
    mockVerify = jest.fn().mockResolvedValue(true);

    (nodemailer.createTransport as jest.Mock).mockReset();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
      verify: mockVerify,
    });

    mockSettingsService = {
      getAllSettings: jest.fn().mockResolvedValue({
        smtp_host: 'smtp.office365.com',
        smtp_port: '587',
        smtp_username: 'smtp-user@hartek.com',
        smtp_password: 'SecretPassword123!',
        smtp_sender_name: 'HARTEK CMD Office',
        smtp_sender_email: 'no-reply@hartek.com',
        support_email: 'support@hartek.com',
      }),
    };

    mockEmailTemplatesService = {
      renderForEvent: jest.fn().mockImplementation((eventKey, vars, fallbackSubj, fallbackBody) => {
        return Promise.resolve({
          subject: `Rendered: ${fallbackSubj}`,
          body: `Rendered Body with user email: ${vars.user_email} and hacker email: hacker@attacker.com`,
          usingCustomTemplate: true,
        });
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsMailer,
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: EmailTemplatesService, useValue: mockEmailTemplatesService },
      ],
    }).compile();

    mailer = module.get<SettingsMailer>(SettingsMailer);
  });

  afterEach(() => {
    // Guarantee complete environment restoration and mock cleanup
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  describe('Security Assertions & Recipient Envelope Routing', () => {
    it('should NEVER allow template body text to alter the explicit target TO email address', async () => {
      // Mock internal sendEmail method to capture the final Nodemailer parameters
      const sendEmailSpy = jest.spyOn(mailer, 'sendEmail').mockResolvedValue(true);

      const recipientUserEmail = 'legitimate.user@hartek.com';

      // Call sendTemplateEmail with arbitrary/malicious template content injected
      await mailer.sendTemplateEmail(
        recipientUserEmail,
        'PASSWORD_RESET',
        {
          user_name: 'Legitimate User',
          user_email: recipientUserEmail,
          otp_code: '123456',
        },
        'Password Reset OTP',
        'Hello, click to reset.',
      );

      // Verify sendEmail was called with the exact recipient user email as target TO
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      const [toParam, subjectParam, textParam] = sendEmailSpy.mock.calls[0];

      expect(toParam).toBe(recipientUserEmail);
      expect(toParam).not.toBe('hacker@attacker.com');
      expect(textParam).toContain('hacker@attacker.com'); // Embedded in body text only
    });
  });

  describe('Fail-Closed Outbound Email Isolation (DISABLE_OUTBOUND_EMAILS=true)', () => {
    it('should evaluate isOutboundEmailDisabled() as true when DISABLE_OUTBOUND_EMAILS is true, 1, or whitespace-padded', () => {
      process.env.DISABLE_OUTBOUND_EMAILS = 'true';
      expect(mailer.isOutboundEmailDisabled()).toBe(true);

      process.env.DISABLE_OUTBOUND_EMAILS = ' TRUE ';
      expect(mailer.isOutboundEmailDisabled()).toBe(true);

      process.env.DISABLE_OUTBOUND_EMAILS = '1';
      expect(mailer.isOutboundEmailDisabled()).toBe(true);

      process.env.DISABLE_OUTBOUND_EMAILS = 'false';
      expect(mailer.isOutboundEmailDisabled()).toBe(false);

      delete process.env.DISABLE_OUTBOUND_EMAILS;
      expect(mailer.isOutboundEmailDisabled()).toBe(false);
    });

    it('should never create an SMTP transporter or attempt network delivery when DISABLE_OUTBOUND_EMAILS=true', async () => {
      process.env.DISABLE_OUTBOUND_EMAILS = 'true';

      const result = await mailer.sendEmail('test@hartek.com', 'Test Subject', 'Test Body');

      expect(result).toBe(false);
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('should prevent sendTemplateEmail from rendering templates or dispatching emails when disabled', async () => {
      process.env.DISABLE_OUTBOUND_EMAILS = 'true';

      const result = await mailer.sendTemplateEmail(
        'user@hartek.com',
        'MFA_OTP',
        { otp_code: '123456' },
        'MFA Verification',
        'Code is 123456',
      );

      expect(result).toBe(false);
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(mockEmailTemplatesService.renderForEvent).not.toHaveBeenCalled();
    });

    it('should fail testConnection safely without attempting network verification when disabled', async () => {
      process.env.DISABLE_OUTBOUND_EMAILS = 'true';

      const result = await mailer.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain('disabled by safety configuration');
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('should ensure database-stored SMTP credentials and overrides CANNOT bypass DISABLE_OUTBOUND_EMAILS=true', async () => {
      process.env.DISABLE_OUTBOUND_EMAILS = 'true';

      // Database has full production credentials, and request passes overrides
      const overrides = {
        smtp_host: 'smtp.office365.com',
        smtp_port: '587',
        smtp_username: 'override-user@hartek.com',
        smtp_password: 'OverridePassword!',
      };

      const sendResult = await mailer.sendEmail('victim@hartek.com', 'Subject', 'Body', undefined, overrides);
      const testResult = await mailer.testConnection(overrides);
      const templateResult = await mailer.sendTemplateEmail(
        'victim@hartek.com',
        'PASSWORD_RESET',
        { otp_code: '999999' },
        'Subject',
        'Body',
        overrides,
      );

      expect(sendResult).toBe(false);
      expect(testResult.success).toBe(false);
      expect(templateResult).toBe(false);
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });
  });

  describe('Staging Environment Mode Fail-Closed Logic', () => {
    it('should fail closed by default when APP_ENV=staging without explicit outbound allow', async () => {
      process.env.APP_ENV = 'staging';

      expect(mailer.isOutboundEmailDisabled()).toBe(true);

      const result = await mailer.sendEmail('staging.test@hartek.com', 'Staging Test', 'Body');
      expect(result).toBe(false);
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('should fail closed by default when NODE_ENV=staging without explicit outbound allow', async () => {
      process.env.NODE_ENV = 'staging';

      expect(mailer.isOutboundEmailDisabled()).toBe(true);

      const result = await mailer.sendEmail('staging.test@hartek.com', 'Staging Test', 'Body');
      expect(result).toBe(false);
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('should fail closed by default when DEPLOY_ENV=staging or STAGING=true', async () => {
      process.env.DEPLOY_ENV = 'staging';
      expect(mailer.isOutboundEmailDisabled()).toBe(true);

      delete process.env.DEPLOY_ENV;
      process.env.STAGING = 'true';
      expect(mailer.isOutboundEmailDisabled()).toBe(true);
    });

    it('should allow outbound email in staging ONLY when explicit ALLOW_OUTBOUND_EMAILS=true is provided', () => {
      process.env.APP_ENV = 'staging';
      process.env.ALLOW_OUTBOUND_EMAILS = 'true';

      expect(mailer.isOutboundEmailDisabled()).toBe(false);
    });

    it('should prioritize explicit DISABLE_OUTBOUND_EMAILS=true over staging allow flags', () => {
      process.env.APP_ENV = 'staging';
      process.env.ALLOW_OUTBOUND_EMAILS = 'true';
      process.env.DISABLE_OUTBOUND_EMAILS = 'true';

      expect(mailer.isOutboundEmailDisabled()).toBe(true);
    });
  });

  describe('Authentication & Account Workflow Paths Under Suppression', () => {
    beforeEach(() => {
      process.env.DISABLE_OUTBOUND_EMAILS = 'true';
    });

    it('should suppress MFA OTP email path and not create transporter', async () => {
      const result = await mailer.sendTemplateEmail(
        'employee@hartek.com',
        'MFA_OTP',
        { otp_code: '456789', user_name: 'Employee One' },
        'Your Login Verification Code',
        'Code: 456789',
      );

      expect(result).toBe(false);
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('should suppress Password Reset OTP email path and not create transporter', async () => {
      const result = await mailer.sendTemplateEmail(
        'employee@hartek.com',
        'PASSWORD_RESET',
        { otp_code: '654321', reset_link: 'https://staging.cmd.hartek.com/forgot-password' },
        'Password Reset OTP',
        'Reset code: 654321',
      );

      expect(result).toBe(false);
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('should suppress User Creation onboarding email path and not create transporter', async () => {
      const result = await mailer.sendTemplateEmail(
        'newhire@hartek.com',
        'USER_CREATED',
        { temporary_password: 'InitialPassword123!', login_url: 'https://staging.cmd.hartek.com/login' },
        'Welcome to HARTEK CMD',
        'Credentials enclosed',
      );

      expect(result).toBe(false);
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    it('should suppress Account Activation / Deactivation emails and not create transporter', async () => {
      const activatedResult = await mailer.sendTemplateEmail(
        'user@hartek.com',
        'ACCOUNT_ACTIVATED',
        { user_name: 'Test User' },
        'Account Activated',
        'Your account is active',
      );
      const deactivatedResult = await mailer.sendTemplateEmail(
        'user@hartek.com',
        'ACCOUNT_DEACTIVATED',
        { user_name: 'Test User' },
        'Account Deactivated',
        'Your account is deactivated',
      );

      expect(activatedResult).toBe(false);
      expect(deactivatedResult).toBe(false);
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });
  });

  describe('Normal Mail Delivery When Enabled', () => {
    it('should successfully create transporter and send mail when outbound email is enabled and credentials exist', async () => {
      const result = await mailer.sendEmail(
        'production.user@hartek.com',
        'System Notification',
        'Hello World',
        '<p>Hello World</p>',
      );

      expect(result).toBe(true);
      expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledWith({
        from: '"HARTEK CMD Office" <smtp-user@hartek.com>',
        to: 'production.user@hartek.com',
        subject: 'System Notification',
        text: 'Hello World',
        html: '<p>Hello World</p>',
      });
    });

    it('should handle SMTP delivery failures gracefully without crashing and return false', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('Connection timeout to mail server'));

      const result = await mailer.sendEmail('production.user@hartek.com', 'Subject', 'Text');

      expect(result).toBe(false);
    });
  });

  describe('PII and Credential Log Sanitization', () => {
    it('should never log recipient email, OTP codes, reset links, or passwords when emails are suppressed', async () => {
      process.env.DISABLE_OUTBOUND_EMAILS = 'true';

      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

      const secretOtp = '778899';
      const secretPassword = 'TopSecretPassword99!';
      const sensitiveRecipient = 'confidential.officer@hartek.com';

      await mailer.sendEmail(
        sensitiveRecipient,
        'Confidential Subject',
        `Your secret OTP is ${secretOtp} and password is ${secretPassword}`,
      );

      await mailer.sendTemplateEmail(
        sensitiveRecipient,
        'PASSWORD_RESET',
        { otp_code: secretOtp, temporary_password: secretPassword },
        'Confidential Reset',
        `Reset code ${secretOtp}`,
      );

      const allLoggedMessages = [
        ...warnSpy.mock.calls.map((c) => String(c[0])),
        ...logSpy.mock.calls.map((c) => String(c[0])),
        ...errorSpy.mock.calls.map((c) => String(c[0])),
      ];

      for (const msg of allLoggedMessages) {
        expect(msg).not.toContain(secretOtp);
        expect(msg).not.toContain(secretPassword);
        expect(msg).not.toContain(sensitiveRecipient);
      }
    });

    it('should never log recipient email, OTP codes, or body in local fallback when credentials are empty', async () => {
      // Mock settings service with blank credentials for all calls
      mockSettingsService.getAllSettings.mockResolvedValue({});

      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

      const secretOtp = '112233';
      const sensitiveRecipient = 'private.user@hartek.com';

      await mailer.sendEmail(
        sensitiveRecipient,
        'Password Reset OTP',
        `Your single use OTP code is ${secretOtp}`,
      );

      const warnMessages = warnSpy.mock.calls.map((c) => String(c[0]));
      for (const msg of warnMessages) {
        expect(msg).not.toContain(secretOtp);
        expect(msg).not.toContain(sensitiveRecipient);
        expect(msg).not.toContain('Your single use OTP');
      }
    });
  });
});
