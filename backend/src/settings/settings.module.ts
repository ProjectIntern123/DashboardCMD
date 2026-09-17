import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { SettingsMailer } from './settings.mailer';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';

@Module({
  imports: [EmailTemplatesModule],
  providers: [SettingsService, SettingsMailer],
  controllers: [SettingsController],
  exports: [SettingsService, SettingsMailer],
})
export class SettingsModule {}
