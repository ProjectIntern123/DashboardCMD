import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProjectModule } from './project/project.module';
import { MeetingModule } from './meeting/meeting.module';
import { TaskModule } from './task/task.module';
import { ActionItemModule } from './action-item/action-item.module';
import { EscalationModule } from './escalation/escalation.module';
import { FollowUpModule } from './follow-up/follow-up.module';
import { LegalModule } from './legal/legal.module';
import { NotepadModule } from './notepad/notepad.module';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { DashboardModule } from './dashboard/dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { UserModule } from './user/user.module';
import { RoleModule } from './role/role.module';
import { EmailTemplatesModule } from './email-templates/email-templates.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ProjectModule,
    MeetingModule,
    TaskModule,
    ActionItemModule,
    EscalationModule,
    FollowUpModule,
    LegalModule,
    NotepadModule,
    AuditModule,
    DashboardModule,
    SettingsModule,
    UserModule,
    RoleModule,
    EmailTemplatesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
