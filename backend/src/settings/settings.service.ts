import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  private cachedMaxAttachmentSizeMb: number | null = null;
  private cacheExpiry: number = 0;

  private readonly publicKeys = [
    'app_logo',
    'app_name',
    'app_subtitle',
    'browser_tab_title',
    'favicon_url',
    'primary_color',
    'accent_color',
    'login_heading',
    'login_subtitle',
    'login_bg',
    'login_logo',
    // Separate admin panel branding
    'admin_logo',
    'admin_name',
    'admin_subtitle',
    'admin_primary_color',
    'admin_accent_color',
    // Custom login positioning & bg
    'login_bg_image',
    'login_bg_type',
    'login_bg_color',
    'login_bg_gradient',
    'login_bg_image_url',
    'login_container_pos',
    'login_container_opacity',
    // Layout adjusters
    'app_header_height',
    'app_logo_width',
    'app_logo_spacing',
    'admin_header_height',
    'admin_logo_width',
    'admin_logo_spacing',
    // Microsoft SMTP configurations
    'smtp_sender_name',
    'smtp_sender_email',
    'smtp_host',
    'smtp_port',
    'smtp_encryption',
    'support_email',
    'apply_branding_to_admin',
    'admin_theme_mode',
    // PWA branding & manifest configurations
    'pwa_name',
    'pwa_short_name',
    'pwa_description',
    'pwa_icon_type',
    'pwa_icon',
    'pwa_theme_color',
    'pwa_background_color',
    'pwa_display',
    'pwa_orientation',
    // System document & attachment settings
    'max_attachment_size_mb',
  ];

  private readonly defaultBranding: Record<string, string> = {
    app_logo: '🏢',
    app_name: 'HARTEK CMD Office',
    app_subtitle: 'Operations Command Center v3',
    browser_tab_title: 'HARTEK CMD Executive Dashboard',
    favicon_url: '',
    primary_color: '#0f2a4a',
    accent_color: '#ef9f27',
    apply_branding_to_admin: 'false',
    login_heading: 'HARTEK Group',
    login_subtitle: 'CMD Office Command Center',
    login_logo: '🏢',
    login_bg: 'linear-gradient(135deg, #0f2a4a 0%, #1a3a60 100%)',
    login_bg_type: 'gradient',
    login_bg_color: '#0f2a4a',
    login_bg_gradient: 'linear-gradient(135deg, #0f2a4a 0%, #1a3a60 100%)',
    login_bg_image: '',
    login_bg_image_url: '',
    admin_logo: '🛡️',
    admin_name: 'HARTEK Admin Console',
    admin_theme_mode: 'light',
    admin_subtitle: 'System Control Center',
    admin_primary_color: '#0f172a',
    admin_accent_color: '#3b82f6',
    login_container_pos: 'center',
    login_container_opacity: '100',
    app_header_height: '65px',
    app_logo_width: '40px',
    app_logo_spacing: '10px',
    admin_header_height: '65px',
    admin_logo_width: '40px',
    admin_logo_spacing: '10px',
    smtp_sender_name: 'HARTEK CMD Office',
    smtp_sender_email: '',
    smtp_username: '',
    smtp_password: '',
    smtp_host: 'smtp.office365.com',
    smtp_port: '587',
    smtp_encryption: 'STARTTLS',
    support_email: 'support@hartek.com',
    // PWA Defaults
    pwa_name: 'HARTEK CMD Office',
    pwa_short_name: 'HARTEK CMD',
    pwa_description: 'HARTEK Group CMD Office Command Center PWA',
    pwa_icon_type: 'branding',
    pwa_icon: '',
    pwa_theme_color: '#0f2a4a',
    pwa_background_color: '#0f2a4a',
    pwa_display: 'standalone',
    pwa_orientation: 'portrait-primary',
    // Document & attachment settings default (10 MB, bounded between 1 MB and 50 MB)
    max_attachment_size_mb: '10',
  };

  async getPublicSettings() {
    const records = await this.prisma.systemSetting.findMany({
      where: { key: { in: this.publicKeys } },
    });

    const settings: Record<string, string> = { ...this.defaultBranding };
    records.forEach((r) => {
      settings[r.key] = r.value;
    });

    return settings;
  }

  async getAllSettings() {
    const records = await this.prisma.systemSetting.findMany();
    const settings: Record<string, string> = {};
    records.forEach((r) => {
      settings[r.key] = r.value;
    });
    return { ...this.defaultBranding, ...settings };
  }

  // Infrastructure physical ceiling constants
  public static readonly INFRASTRUCTURE_PAYLOAD_LIMIT_MB = 50; // Nginx client_max_body_size and Express limit
  public static readonly MAX_SAFE_INLINE_BASE64_MB = 35; // Maximum raw file size before 4/3 Base64 inflation exceeds 50MB

  async getMaxAttachmentSizeMb(): Promise<number> {
    const now = Date.now();
    if (this.cachedMaxAttachmentSizeMb !== null && now < this.cacheExpiry) {
      return this.cachedMaxAttachmentSizeMb;
    }

    try {
      const record = await this.prisma.systemSetting.findUnique({
        where: { key: 'max_attachment_size_mb' },
      });
      if (record && record.value) {
        const parsed = parseInt(record.value, 10);
        if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 9999) {
          this.cachedMaxAttachmentSizeMb = parsed;
          this.cacheExpiry = now + 15000;
          return parsed;
        }
      }
    } catch (e) {
      // Fail safely to default
    }

    this.cachedMaxAttachmentSizeMb = 10;
    this.cacheExpiry = now + 15000;
    return 10;
  }

  async validateAttachmentSizes(attachments?: Array<{ name?: string; size?: number; data?: string }>): Promise<void> {
    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
      return;
    }
    const configuredMaxMb = await this.getMaxAttachmentSizeMb();
    const configuredMaxBytes = configuredMaxMb * 1024 * 1024;
    // Hard ceiling for Base64 JSON payloads: 35 MB raw (expands to ~47 MB in Base64, fitting within 50MB Express limit)
    const transportCeilingBytes = SettingsService.MAX_SAFE_INLINE_BASE64_MB * 1024 * 1024;

    let totalCumulativeBytes = 0;

    for (const att of attachments) {
      if (!att) continue;
      let effectiveSize = typeof att.size === 'number' && Number.isFinite(att.size) && att.size > 0 ? att.size : 0;

      // Calculate actual size from base64 data string if present, taking the maximum of reported and computed size to prevent client spoofing
      if (typeof att.data === 'string' && att.data.length > 0) {
        const base64Str = att.data.includes(',') ? att.data.split(',')[1] : att.data;
        const computedBytes = Math.floor((base64Str.length * 3) / 4);
        if (computedBytes > effectiveSize) {
          effectiveSize = computedBytes;
        }
      }

      totalCumulativeBytes += effectiveSize;

      // Check per-file against configured policy
      if (effectiveSize > configuredMaxBytes) {
        const sizeMb = (effectiveSize / (1024 * 1024)).toFixed(1);
        const fileName = att.name ? `"${att.name}"` : 'Attachment';
        throw new BadRequestException(
          `${fileName} (${sizeMb} MB) exceeds the configured maximum permitted attachment size of ${configuredMaxMb} MB. Please select a smaller file.`
        );
      }

      // Check per-file against transport payload capability if configured limit exceeds infrastructure ceiling
      if (effectiveSize > transportCeilingBytes) {
        const sizeMb = (effectiveSize / (1024 * 1024)).toFixed(1);
        const fileName = att.name ? `"${att.name}"` : 'Attachment';
        throw new BadRequestException(
          `${fileName} (${sizeMb} MB) exceeds the 35 MB raw file ceiling for Base64 JSON payloads (bounded by the 50 MB server body limit). To upload files larger than 35 MB, streaming or multipart storage configuration is required.`
        );
      }
    }

    // Check cumulative request size for multi-file payloads
    if (attachments.length > 1 && totalCumulativeBytes > transportCeilingBytes) {
      const totalMb = (totalCumulativeBytes / (1024 * 1024)).toFixed(1);
      throw new BadRequestException(
        `Total attachments size (${totalMb} MB) in a single request exceeds the 35 MB raw file ceiling (bounded by the 50 MB server body limit). Please upload fewer or smaller files.`
      );
    }
  }

  async validateFileSize(sizeInBytes: number, fileName?: string): Promise<void> {
    const configuredMaxMb = await this.getMaxAttachmentSizeMb();
    const configuredMaxBytes = configuredMaxMb * 1024 * 1024;
    // For binary/multipart uploads (e.g. CSV import), payload is not Base64-inflated, so it is bounded by the 50 MB Express/Nginx body limit
    const infrastructureMaxBytes = SettingsService.INFRASTRUCTURE_PAYLOAD_LIMIT_MB * 1024 * 1024;

    if (sizeInBytes > configuredMaxBytes) {
      const sizeMb = (sizeInBytes / (1024 * 1024)).toFixed(1);
      const name = fileName ? `"${fileName}"` : 'Uploaded file';
      throw new BadRequestException(
        `${name} (${sizeMb} MB) exceeds the configured maximum permitted file size of ${configuredMaxMb} MB. Please select a smaller file.`
      );
    }

    if (sizeInBytes > infrastructureMaxBytes) {
      const sizeMb = (sizeInBytes / (1024 * 1024)).toFixed(1);
      const name = fileName ? `"${fileName}"` : 'Uploaded file';
      throw new BadRequestException(
        `${name} (${sizeMb} MB) exceeds the server infrastructure limit of ${SettingsService.INFRASTRUCTURE_PAYLOAD_LIMIT_MB} MB. Reconfiguration of Nginx client_max_body_size and Express limits is required to accept larger files.`
      );
    }
  }

  async updateAttachmentSizeLimit(maxMb: number) {
    if (!Number.isInteger(maxMb) || maxMb < 1 || maxMb > SettingsService.MAX_SAFE_INLINE_BASE64_MB) {
      throw new BadRequestException(
        `Maximum attachment size must be an integer between 1 MB and ${SettingsService.MAX_SAFE_INLINE_BASE64_MB} MB.`
      );
    }
    await this.prisma.systemSetting.upsert({
      where: { key: 'max_attachment_size_mb' },
      update: { value: String(maxMb), description: 'Maximum permitted document and attachment upload size in megabytes (MB)' },
      create: { key: 'max_attachment_size_mb', value: String(maxMb), description: 'Maximum permitted document and attachment upload size in megabytes (MB)' },
    });
    this.cachedMaxAttachmentSizeMb = maxMb;
    this.cacheExpiry = Date.now() + 15000;

    return {
      success: true,
      maxAttachmentSizeMb: maxMb,
      infrastructureLimitMb: SettingsService.INFRASTRUCTURE_PAYLOAD_LIMIT_MB,
      maxSafeInlineMb: SettingsService.MAX_SAFE_INLINE_BASE64_MB,
      isInfrastructureExceeded: false,
      message: `Maximum attachment size updated to ${maxMb} MB.`,
    };
  }

  async updateSettings(updates: Record<string, string>) {
    if ('max_attachment_size_mb' in updates) {
      const val = updates['max_attachment_size_mb'];
      const strVal = String(val ?? '').trim();
      if (!strVal) {
        throw new BadRequestException('Maximum attachment size is required.');
      }
      if (!/^\d+$/.test(strVal)) {
        throw new BadRequestException(
          `Maximum attachment size must be an integer between 1 MB and ${SettingsService.MAX_SAFE_INLINE_BASE64_MB} MB.`
        );
      }
      const num = parseInt(strVal, 10);
      if (!Number.isFinite(num) || num < 1 || num > SettingsService.MAX_SAFE_INLINE_BASE64_MB) {
        throw new BadRequestException(
          `Maximum attachment size must be between 1 MB and ${SettingsService.MAX_SAFE_INLINE_BASE64_MB} MB.`
        );
      }
      this.cachedMaxAttachmentSizeMb = num;
      this.cacheExpiry = Date.now() + 15000;
    }

    const existing = await this.getAllSettings();
    const keys = Object.keys(updates);

    const operations = keys
      .filter((key) => {
        // Do not overwrite an existing non-empty password with an empty string
        if (key === 'smtp_password' && (!updates[key] || updates[key].trim() === '') && existing.smtp_password) {
          return false;
        }
        return true;
      })
      .map((key) =>
        this.prisma.systemSetting.upsert({
          where: { key },
          update: { value: updates[key] !== undefined && updates[key] !== null ? String(updates[key]) : '' },
          create: { key, value: updates[key] !== undefined && updates[key] !== null ? String(updates[key]) : '' },
        }),
      );

    await Promise.all(operations);
    return this.getAllSettings();
  }
}
