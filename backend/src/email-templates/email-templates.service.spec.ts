import { Test, TestingModule } from '@nestjs/testing';
import { EmailTemplatesService, SYSTEM_NOTIFICATION_EVENTS } from './email-templates.service';
import { PrismaService } from '../prisma/prisma.service';

describe('EmailTemplatesService Unit Tests', () => {
  let service: EmailTemplatesService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      emailTemplate: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.eventKey === 'PASSWORD_RESET') {
            return Promise.resolve({
              id: 'tpl-1',
              name: 'Password Reset',
              eventKey: 'PASSWORD_RESET',
              subject: 'Reset Password for {{user_name}}',
              body: 'Hello {{user_name}}, OTP is {{otp_code}}. Email: {{user_email}}',
              isActive: true,
            });
          }
          return Promise.resolve(null);
        }),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<EmailTemplatesService>(EmailTemplatesService);
  });

  describe('Variable Substitution & Renderer Engine (renderString)', () => {
    it('should correctly render all 11 mandatory and supported template variables', () => {
      const template = `Hello {{user_name}} ({{user_email}}),
OTP: {{otp_code}} (Expires: {{otp_expires_in}} mins)
Reset Link: {{reset_link}} | Login URL: {{login_url}}
Company: {{company_name}} | Temp Pass: {{temporary_password}}
Date: {{date_time}} | Support: {{support_email}} | IsTemp: {{is_temp_password}}`;

      const vars = {
        user_name: 'Jane Smith',
        user_email: 'jane.smith@hartek.com',
        otp_code: '987654',
        otp_expires_in: '15',
        reset_link: 'https://cmd.hartek.tech/reset?code=987654',
        login_url: 'https://cmd.hartek.tech/login',
        company_name: 'HARTEK Group',
        temporary_password: 'TempPassword123!',
        date_time: '18/09/2026, 10:30:00',
        support_email: 'support@hartek.com',
        is_temp_password: 'true',
      };

      const result = service.renderString(template, vars);

      expect(result).toContain('Jane Smith');
      expect(result).toContain('jane.smith@hartek.com');
      expect(result).toContain('987654');
      expect(result).toContain('Expires: 15 mins');
      expect(result).toContain('https://cmd.hartek.tech/reset?code=987654');
      expect(result).toContain('https://cmd.hartek.tech/login');
      expect(result).toContain('HARTEK Group');
      expect(result).toContain('TempPassword123!');
      expect(result).toContain('18/09/2026, 10:30:00');
      expect(result).toContain('support@hartek.com');
      expect(result).toContain('IsTemp: true');
    });

    it('should preserve unresolved placeholders when a variable is unsupplied', () => {
      const template = 'Hello {{user_name}}, your code is {{unknown_variable}}.';
      const result = service.renderString(template, { user_name: 'Alice' });
      expect(result).toBe('Hello Alice, your code is {{unknown_variable}}.');
    });
  });

  describe('Event Resolution (renderForEvent)', () => {
    it('should render custom active template from database for PASSWORD_RESET event', async () => {
      const result = await service.renderForEvent(
        'PASSWORD_RESET',
        { user_name: 'Bob', otp_code: '123456', user_email: 'bob@example.com' },
        'Default Subject',
        'Default Body',
      );

      expect(result.usingCustomTemplate).toBe(true);
      expect(result.subject).toBe('Reset Password for Bob');
      expect(result.body).toBe('Hello Bob, OTP is 123456. Email: bob@example.com');
    });

    it('should fallback gracefully when template is inactive or missing', async () => {
      const result = await service.renderForEvent(
        'UNCONFIGURED_EVENT',
        { user_name: 'Charlie' },
        'Fallback {{user_name}}',
        'Fallback Body for {{user_name}}',
      );

      expect(result.usingCustomTemplate).toBe(false);
      expect(result.subject).toBe('Fallback Charlie');
      expect(result.body).toBe('Fallback Body for Charlie');
    });
  });

  describe('Preview Cleanliness', () => {
    it('should use safe generic sample values and contain no personal emails', async () => {
      const preview = await service.preview({
        subject: 'Welcome {{user_name}}',
        body: 'Email: {{user_email}}',
      });

      expect(preview.subject).toBe('Welcome John Doe');
      expect(preview.body).toBe('Email: john.doe@example.com');
      expect(JSON.stringify(preview)).not.toContain('pankaj.rawat@hartek.com');
    });
  });

  describe('System Event Inventory Verification', () => {
    it('should contain all 7 required system notification events', () => {
      const keys = SYSTEM_NOTIFICATION_EVENTS.map((e) => e.eventKey);
      expect(keys).toContain('PASSWORD_RESET');
      expect(keys).toContain('USER_CREATED');
      expect(keys).toContain('PASSWORD_CHANGED');
      expect(keys).toContain('ACCOUNT_ACTIVATED');
      expect(keys).toContain('ACCOUNT_DEACTIVATED');
      expect(keys).toContain('WELCOME_EMAIL');
      expect(keys).toContain('MFA_OTP');
    });
  });
});
