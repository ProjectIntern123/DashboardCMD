import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

import { SettingsMailer } from './settings.mailer';

@Module({
  providers: [SettingsService, SettingsMailer],
  controllers: [SettingsController],
  exports: [SettingsService, SettingsMailer],
})
export class SettingsModule {}
