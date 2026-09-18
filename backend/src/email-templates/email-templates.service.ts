import { Injectable, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

export const SYSTEM_NOTIFICATION_EVENTS = [
  {
    eventKey: 'PASSWORD_RESET',
    name: 'Password Reset OTP Notification',
    description: 'Sent when a user requests a password reset link/OTP code.',
    defaultSubject: 'Reset Your HARTEK CMD Account Password',
    defaultBody: `Hello {{user_name}},

We received a request to reset your password for your HARTEK CMD Command Center account.

Your verification details:
- OTP Code: {{otp_code}}
- Expires in: {{otp_expires_in}} minutes
- Account Email: {{user_email}}
- Reset Link: {{reset_link}}

If you did not request a password reset, please ignore this email or contact security at {{support_email}}.

Best Regards,
{{company_name}} Administrator`,
    availableVariables: ['user_name', 'user_email', 'otp_code', 'otp_expires_in', 'reset_link', 'login_url', 'company_name', 'support_email', 'date_time'],
  },
  {
    eventKey: 'USER_CREATED',
    name: 'New User Credentials Notification',
    description: 'Sent when an administrator creates a new user account with login credentials.',
    defaultSubject: 'Welcome to HARTEK CMD Dashboard - Your Account Credentials',
    defaultBody: `Hello {{user_name}},

Your user profile has been created on the {{company_name}} Command Center.

Here are your account login credentials:
- Login URL: {{login_url}}
- Username / Email: {{user_email}}
- Temporary Password: {{temporary_password}}

Note: You have been assigned a temporary password. You will be required to change it upon first login.

Thank You,
{{company_name}} Corporate Office`,
    availableVariables: ['user_name', 'user_email', 'temporary_password', 'is_temp_password', 'login_url', 'company_name', 'support_email', 'date_time'],
  },
  {
    eventKey: 'PASSWORD_CHANGED',
    name: 'Password Changed Confirmation',
    description: 'Sent after a user successfully updates or resets their password.',
    defaultSubject: 'Security Alert: Your HARTEK CMD Password Has Been Updated',
    defaultBody: `Hello {{user_name}},

This is a security notification to confirm that your HARTEK CMD account password was changed successfully on {{date_time}}.

If you did not perform this change, please immediately contact security at {{support_email}}.

Best Regards,
{{company_name}} IT Security Team`,
    availableVariables: ['user_name', 'user_email', 'date_time', 'company_name', 'support_email', 'login_url', 'temporary_password'],
  },
  {
    eventKey: 'ACCOUNT_ACTIVATED',
    name: 'Account Activated Notification',
    description: 'Sent when a suspended or new user account is set to active state.',
    defaultSubject: 'Your Account Has Been Activated - HARTEK CMD Dashboard',
    defaultBody: `Hello {{user_name}},

Your HARTEK CMD account ({{user_email}}) has been activated.

You may now sign in to access your assigned command modules:
Login Portal: {{login_url}}

Welcome back!
{{company_name}} Admin Team`,
    availableVariables: ['user_name', 'user_email', 'login_url', 'company_name', 'support_email', 'date_time'],
  },
  {
    eventKey: 'ACCOUNT_DEACTIVATED',
    name: 'Account Deactivated Notice',
    description: 'Sent when an account access is deactivated by an administrator.',
    defaultSubject: 'Notice: Your HARTEK CMD Account Access Has Been Deactivated',
    defaultBody: `Hello {{user_name}},

Please be advised that your HARTEK CMD account access ({{user_email}}) has been deactivated by system administration.

If you believe this is an error or require assistance, please contact IT support at {{support_email}}.

Thank You,
{{company_name}} Corporate Office`,
    availableVariables: ['user_name', 'user_email', 'company_name', 'support_email', 'date_time'],
  },
  {
    eventKey: 'WELCOME_EMAIL',
    name: 'Welcome & System Overview',
    description: 'Sent as a welcome/onboarding email to newly verified team members.',
    defaultSubject: 'Welcome to HARTEK Group CMD Command Center',
    defaultBody: `Hello {{user_name}},

Welcome aboard! You have been granted access to the HARTEK Group CMD Command Center Portal.

Quick Access Link: {{login_url}}

If you have any questions regarding your access role or assigned modules, feel free to reach out to {{support_email}}.

Best Regards,
{{company_name}} Executive Management`,
    availableVariables: ['user_name', 'user_email', 'login_url', 'company_name', 'support_email', 'date_time'],
  },
  {
    eventKey: 'MFA_OTP',
    name: 'MFA OTP Verification Code',
    description: 'Sent when a user requests a Multi-Factor Authentication OTP code during sign in.',
    defaultSubject: 'HARTEK CMD - Multi-Factor Authentication OTP Code',
    defaultBody: `Hello {{user_name}},

Your One-Time Verification Code is: {{otp_code}}

This verification code expires in {{otp_expires_in}} minutes.

If you did not request this verification code, please immediately contact security at {{support_email}}.

Best Regards,
{{company_name}} Security Team`,
    availableVariables: ['user_name', 'user_email', 'otp_code', 'otp_expires_in', 'login_url', 'company_name', 'support_email', 'date_time'],
  },
];

@Injectable()
export class EmailTemplatesService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      console.log('[EMAIL TEMPLATES] Synchronizing default system email templates in database...');
      for (const evt of SYSTEM_NOTIFICATION_EVENTS) {
        const existing = await this.prisma.emailTemplate.findUnique({
          where: { eventKey: evt.eventKey },
        });

        if (!existing) {
          await this.prisma.emailTemplate.create({
            data: {
              name: evt.name,
              eventKey: evt.eventKey,
              subject: evt.defaultSubject,
              body: evt.defaultBody,
              description: evt.description,
              isActive: true,
            },
          });
          console.log(`[EMAIL TEMPLATES] Seeded missing template for event "${evt.eventKey}"`);
        }
      }
      console.log('[EMAIL TEMPLATES] Default system email templates successfully synchronized.');
    } catch (e) {
      console.error('[EMAIL TEMPLATES] Seeding/Sync check skipped/failed:', e.message);
    }
  }

  async findAll() {
    const templates = await this.prisma.emailTemplate.findMany({
      orderBy: { createdAt: 'asc' },
    });

    // Attach metadata about event key and available variables
    return templates.map((t) => {
      const metadata = SYSTEM_NOTIFICATION_EVENTS.find((e) => e.eventKey === t.eventKey);
      return {
        ...t,
        availableVariables: metadata?.availableVariables || ['user_name', 'user_email', 'company_name', 'login_url', 'support_email', 'date_time'],
      };
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Email template with ID "${id}" not found.`);
    }

    const metadata = SYSTEM_NOTIFICATION_EVENTS.find((e) => e.eventKey === template.eventKey);
    return {
      ...template,
      availableVariables: metadata?.availableVariables || ['user_name', 'user_email', 'company_name', 'login_url', 'support_email', 'date_time'],
    };
  }

  async create(dto: CreateEmailTemplateDto) {
    const formattedKey = dto.eventKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');

    const existingKey = await this.prisma.emailTemplate.findUnique({
      where: { eventKey: formattedKey },
    });
    if (existingKey) {
      throw new BadRequestException(`An email template for event key "${formattedKey}" already exists.`);
    }

    const existingName = await this.prisma.emailTemplate.findUnique({
      where: { name: dto.name },
    });
    if (existingName) {
      throw new BadRequestException(`An email template with name "${dto.name}" already exists.`);
    }

    return this.prisma.emailTemplate.create({
      data: {
        name: dto.name,
        eventKey: formattedKey,
        subject: dto.subject,
        body: dto.body,
        description: dto.description || '',
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });
  }

  async update(id: string, dto: UpdateEmailTemplateDto) {
    await this.findOne(id);

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.subject) updateData.subject = dto.subject;
    if (dto.body) updateData.body = dto.body;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    if (dto.eventKey) {
      const formattedKey = dto.eventKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
      const existing = await this.prisma.emailTemplate.findFirst({
        where: { eventKey: formattedKey, id: { not: id } },
      });
      if (existing) {
        throw new BadRequestException(`Another template already uses event key "${formattedKey}".`);
      }
      updateData.eventKey = formattedKey;
    }

    return this.prisma.emailTemplate.update({
      where: { id },
      data: updateData,
    });
  }

  async toggleActive(id: string) {
    const template = await this.findOne(id);
    return this.prisma.emailTemplate.update({
      where: { id },
      data: { isActive: !template.isActive },
    });
  }

  async remove(id: string) {
    const template = await this.findOne(id);
    return this.prisma.emailTemplate.delete({
      where: { id: template.id },
    });
  }

  // Safe Variable Substitution Engine
  renderString(templateStr: string, variables: Record<string, any>): string {
    if (!templateStr) return '';
    return templateStr.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
      if (Object.prototype.hasOwnProperty.call(variables, key) && variables[key] !== undefined && variables[key] !== null) {
        return String(variables[key]);
      }
      return match; // Leave unreplaced placeholder if variable missing
    });
  }

  async preview(payload: { id?: string; subject?: string; body?: string; sampleVariables?: Record<string, any> }) {
    let subject = payload.subject || '';
    let body = payload.body || '';

    if (payload.id && (!subject || !body)) {
      const template = await this.findOne(payload.id);
      subject = subject || template.subject;
      body = body || template.body;
    }

    const defaultSamples: Record<string, string> = {
      user_name: 'John Doe',
      user_email: 'john.doe@example.com',
      otp_code: '482910',
      otp_expires_in: '10',
      temporary_password: 'x9z1ryT7SS81',
      reset_link: 'https://cmd.hartek.tech/reset-password?code=482910',
      login_url: 'https://cmd.hartek.tech/login',
      company_name: 'HARTEK Group',
      date_time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      support_email: 'support@hartek.com',
      is_temp_password: 'true',
    };

    const vars = { ...defaultSamples, ...(payload.sampleVariables || {}) };

    const renderedSubject = this.renderString(subject, vars);
    const renderedBody = this.renderString(body, vars);

    return {
      subject: renderedSubject,
      body: renderedBody,
      sampleVariablesUsed: vars,
    };
  }

  // Production-Safe Fallback Template Resolver
  async renderForEvent(eventKey: string, variables: Record<string, any>, fallbackSubject?: string, fallbackBody?: string) {
    const formattedKey = eventKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');

    try {
      const template = await this.prisma.emailTemplate.findUnique({
        where: { eventKey: formattedKey },
      });

      if (template && template.isActive && template.subject && template.body) {
        return {
          subject: this.renderString(template.subject, variables),
          body: this.renderString(template.body, variables),
          usingCustomTemplate: true,
        };
      }
    } catch (err) {
      console.warn(`[EMAIL TEMPLATES] Render for event "${eventKey}" failed, falling back to system event default:`, err.message);
    }

    // Fall back to system default event template definition
    const systemEvent = SYSTEM_NOTIFICATION_EVENTS.find((e) => e.eventKey === formattedKey);
    const defaultSubj = (fallbackSubject && fallbackSubject.trim()) || systemEvent?.defaultSubject || `HARTEK CMD Notification - ${formattedKey}`;
    const defaultBody = (fallbackBody && fallbackBody.trim()) || systemEvent?.defaultBody || `Hello {{user_name}},\n\nThis is an automated notification from {{company_name}}.`;

    return {
      subject: this.renderString(defaultSubj, variables),
      body: this.renderString(defaultBody, variables),
      usingCustomTemplate: false,
    };
  }
}
