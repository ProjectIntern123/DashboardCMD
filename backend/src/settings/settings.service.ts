import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  private readonly publicKeys = [
    'app_logo',
    'app_name',
    'app_subtitle',
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
  ];

  private readonly defaultBranding: Record<string, string> = {
    app_logo: '🏢',
    app_name: 'HARTEK CMD Office',
    app_subtitle: 'Operations Command Center v3',
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

  async updateSettings(updates: Record<string, string>) {
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
