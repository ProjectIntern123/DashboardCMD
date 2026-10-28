import { Controller, Get, Put, Post, Body, UseGuards, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsMailer } from './settings.mailer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortalGuard } from '../auth/guards/portal.guard';
import { AdminPortalOnly } from '../auth/decorators/portal.decorator';
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

  @Get('attachment-limit')
  async getAttachmentLimit() {
    const maxAttachmentSizeMb = await this.settingsService.getMaxAttachmentSizeMb();
    return {
      maxAttachmentSizeMb,
      minMb: 1,
      maxMb: SettingsService.MAX_SAFE_INLINE_BASE64_MB,
      defaultMb: 10,
      infrastructureLimitMb: SettingsService.INFRASTRUCTURE_PAYLOAD_LIMIT_MB,
      maxSafeInlineMb: SettingsService.MAX_SAFE_INLINE_BASE64_MB,
      isInfrastructureExceeded: maxAttachmentSizeMb > SettingsService.MAX_SAFE_INLINE_BASE64_MB,
    };
  }

  @UseGuards(JwtAuthGuard, PortalGuard)
  @AdminPortalOnly()
  @Put('attachment-limit')
  async updateAttachmentLimit(
    @Body() body: { maxAttachmentSizeMb: number | string },
    @GetUser('role') role: string,
  ) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can update attachment size limits');
    }
    const raw = body?.maxAttachmentSizeMb;
    const strVal = String(raw ?? '').trim();
    if (!strVal || !/^\d+$/.test(strVal)) {
      throw new BadRequestException(
        `Maximum attachment size must be an integer between 1 MB and ${SettingsService.MAX_SAFE_INLINE_BASE64_MB} MB.`
      );
    }
    const parsed = parseInt(strVal, 10);
    if (parsed < 1 || parsed > SettingsService.MAX_SAFE_INLINE_BASE64_MB) {
      throw new BadRequestException(
        `Maximum attachment size must be between 1 MB and ${SettingsService.MAX_SAFE_INLINE_BASE64_MB} MB to fit within the server payload limits.`
      );
    }
    return this.settingsService.updateAttachmentSizeLimit(parsed);
  }

  @UseGuards(JwtAuthGuard, PortalGuard)
  @AdminPortalOnly()
  @Get()
  getAll(@GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can access configuration settings');
    }
    return this.settingsService.getAllSettings();
  }

  @UseGuards(JwtAuthGuard, PortalGuard)
  @AdminPortalOnly()
  @Put()
  update(@Body() updates: Record<string, string>, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can save configuration updates');
    }
    return this.settingsService.updateSettings(updates);
  }

  @UseGuards(JwtAuthGuard, PortalGuard)
  @AdminPortalOnly()
  @Post('smtp/test')
  async testSmtpConnection(@Body() overrides: Record<string, string>, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can trigger SMTP tests');
    }
    return this.settingsMailer.testConnection(overrides);
  }

  @UseGuards(JwtAuthGuard, PortalGuard)
  @AdminPortalOnly()
  @Post('smtp/test-email')
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
