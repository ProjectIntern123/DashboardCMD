import { Controller, Get, Put, Post, Body, UseGuards, ForbiddenException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsMailer } from './settings.mailer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly settingsMailer: SettingsMailer,
  ) {}

  @Get('public')
  getPublic() {
    return this.settingsService.getPublicSettings();
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getAll(@GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can access configuration settings');
    }
    return this.settingsService.getAllSettings();
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  update(@Body() updates: Record<string, string>, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can save configuration updates');
    }
    return this.settingsService.updateSettings(updates);
  }

  @Post('smtp/test')
  @UseGuards(JwtAuthGuard)
  async testSmtpConnection(@Body() overrides: Record<string, string>, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can trigger SMTP tests');
    }
    return this.settingsMailer.testConnection(overrides);
  }

  @Post('smtp/test-email')
  @UseGuards(JwtAuthGuard)
  async sendTestEmail(@Body() body: { to: string } & Record<string, string>, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can send SMTP test emails');
    }
    const { to, ...overrides } = body || {};
    const recipient = to || overrides?.smtp_username || overrides?.smtp_sender_email || 'test@hartek.com';

    const success = await this.settingsMailer.sendEmail(
      recipient,
      'HARTEK Unified Portal - SMTP Test Connection Successful',
      'Hello!\n\nThis is a system test message from your HARTEK CMD Command Center. Your Microsoft 365 / Outlook SMTP email settings are working properly!',
      undefined,
      overrides,
    );
    return { success, message: success ? `Test email dispatched successfully to ${recipient}!` : 'SMTP sending failed. Please check credentials or Office 365 settings.' };
  }
}
