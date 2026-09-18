import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import * as nodemailer from 'nodemailer';

@Injectable()
export class SettingsMailer {
  private readonly logger = new Logger(SettingsMailer.name);

  constructor(
    private readonly settingsService: SettingsService,
    @Optional() private readonly emailTemplatesService?: EmailTemplatesService,
  ) {}

  /**
   * Builds the Nodemailer transporter dynamically from current database settings or overrides.
   */
  private async getTransporter(overrides?: Record<string, string>) {
    const config = await this.settingsService.getAllSettings();
    
    // Merge database config with live form overrides (ignoring blank override passwords)
    const merged: Record<string, string> = { ...config };
    if (overrides) {
      Object.keys(overrides).forEach((k) => {
        if (overrides[k] !== undefined && overrides[k] !== null && overrides[k] !== '') {
          merged[k] = overrides[k];
        }
      });
    }

    const host = (merged.smtp_host || config.smtp_host || process.env.SMTP_HOST || 'smtp.office365.com').trim();
    const port = parseInt(merged.smtp_port || config.smtp_port || process.env.SMTP_PORT || '587', 10);
    const user = (merged.smtp_username || config.smtp_username || process.env.SMTP_USERNAME || process.env.SMTP_USER || '').trim();
    const pass = (merged.smtp_password || config.smtp_password || process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '').trim();

    if (!user || !pass) {
      this.logger.warn('SMTP Mailer requested, but SMTP username or password is not configured.');
      return null;
    }

    const isOffice365 = host.toLowerCase().includes('office365') || host.toLowerCase().includes('outlook');
    const isSecure = port === 465;
    const isStartTls = port === 587 || (merged.smtp_encryption && merged.smtp_encryption.toUpperCase() === 'STARTTLS');

    const transportConfig: any = {
      host,
      port,
      secure: isSecure,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    };

    if (isStartTls) {
      transportConfig.requireTLS = true;
    }

    return nodemailer.createTransport(transportConfig);
  }

  /**
   * Test connection using SMTP verification with optional live form overrides.
   */
  async testConnection(overrides?: Record<string, string>): Promise<{ success: boolean; message: string }> {
    try {
      const transporter = await this.getTransporter(overrides);
      if (!transporter) {
        return { success: false, message: 'SMTP credentials (Username/Password) are missing in settings or .env file.' };
      }
      await transporter.verify();
      return { success: true, message: 'Successfully connected and authenticated with Microsoft SMTP Server!' };
    } catch (e: any) {
      this.logger.error(`SMTP Connection Test Failed: ${e.message}`);
      let userFriendlyMessage = e.message || 'SMTP Handshake or authentication failed.';
      if (e.message?.includes('535 5.7.139') || e.message?.includes('Authentication unsuccessful')) {
        userFriendlyMessage = 'SMTP Auth Failed (535 5.7.139). Please verify: 1) Password is correct & not expired, 2) SMTP AUTH is enabled for this mailbox in Office 365 Admin Portal, 3) Account is not blocked by MFA/Security Defaults policy.';
      } else if (e.message?.includes('ETIMEDOUT') || e.message?.includes('ECONNREFUSED')) {
        userFriendlyMessage = `Connection Timeout to ${overrides?.smtp_host || 'smtp.office365.com'}:${overrides?.smtp_port || '587'}. Check network or firewall settings.`;
      }
      return { success: false, message: userFriendlyMessage };
    }
  }

  /**
   * Sends an email via Microsoft SMTP with optional live form overrides.
   */
  async sendEmail(to: string, subject: string, text: string, html?: string, overrides?: Record<string, string>): Promise<boolean> {
    try {
      const config = await this.settingsService.getAllSettings();
      const merged = { ...config, ...overrides };
      const transporter = await this.getTransporter(overrides);

      if (!transporter) {
        this.logger.warn(`[Local Logs Fallback] Recipient: ${to} | Subject: ${subject} | Body: ${text}`);
        return false;
      }

      const senderName = merged.smtp_sender_name || 'HARTEK CMD Office';
      const smtpUser = (merged.smtp_username || config.smtp_username || process.env.SMTP_USERNAME || process.env.SMTP_USER || '').trim();
      
      let senderEmail = (merged.smtp_sender_email || '').trim();
      // Office 365 / Exchange Requirement: Default 'no-reply' or unconfigured sender email must match authenticated user to prevent SendAsDenied (554 5.2.252)
      if (!senderEmail || senderEmail === 'no-reply@hartek.com') {
        senderEmail = smtpUser || 'no-reply@hartek.com';
      }

      await transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to: to.trim(),
        subject,
        text,
        html: html || text.replace(/\n/g, '<br>'),
      });

      this.logger.log(`SMTP Email successfully sent to ${to}`);
      return true;
    } catch (e: any) {
      this.logger.error(`Failed to send email to ${to}: ${e.message}`);
      return false;
    }
  }

  /**
   * Sends an email dynamically using the Email Templates system if available, falling back safely if unconfigured.
   */
  async sendTemplateEmail(
    to: string,
    eventKey: string,
    variables: Record<string, any>,
    defaultSubject?: string,
    defaultText?: string,
    overrides?: Record<string, string>,
  ): Promise<boolean> {
    let subject = defaultSubject || '';
    let text = defaultText || '';

    if (this.emailTemplatesService) {
      try {
        const rendered = await this.emailTemplatesService.renderForEvent(eventKey, variables, defaultSubject, defaultText);
        if (rendered.isDisabled) {
          this.logger.log(`[EMAIL TEMPLATES] Email dispatch for event "${eventKey}" skipped because template is set to inactive.`);
          return false;
        }
        subject = rendered.subject;
        text = rendered.body;
      } catch (err: any) {
        this.logger.warn(`Template lookup for event "${eventKey}" failed, using fallback email content: ${err.message}`);
      }
    }

    return this.sendEmail(to, subject, text, undefined, overrides);
  }
}
