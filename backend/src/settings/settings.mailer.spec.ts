import { Test, TestingModule } from '@nestjs/testing';
import { SettingsMailer } from './settings.mailer';
import { SettingsService } from './settings.service';
import { EmailTemplatesService } from '../email-templates/email-templates.service';

describe('SettingsMailer Security & Recipient Routing Tests', () => {
  let mailer: SettingsMailer;
  let mockSettingsService: any;
  let mockEmailTemplatesService: any;

  beforeEach(async () => {
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
});
