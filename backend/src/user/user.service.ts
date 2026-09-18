import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { SettingsMailer } from '../settings/settings.mailer';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private settingsMailer: SettingsMailer,
    private settingsService: SettingsService,
  ) { }

  async findAll(actorRole: string) {
    const isSystemAdmin = actorRole === 'Admin';

    const where: any = {};

    if (!isSystemAdmin) {
      where.role = {
        name: { notIn: ['Admin'] },
      };
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        initials: true,
        active: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,
        requiresPasswordReset: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: any) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });

    if (existing) {
      throw new BadRequestException('A user with this email address already exists.');
    }

    // Default password logic if omitted or provided
    const tempPassword = dto.password ? dto.password : Math.random().toString(36).substring(2, 10);
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const isTempPassword = !dto.password;

    const initials = dto.name ? dto.name.split(' ').map((p: string) => p[0]).join('').substring(0, 3).toUpperCase() : 'US';

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.trim().toLowerCase(),
        name: dto.name.trim(),
        initials,
        passwordHash,
        roleId: dto.roleId || null,
        managerId: dto.managerId || null,
        active: dto.active !== undefined ? dto.active : true,
        requiresPasswordReset: isTempPassword,
      },
      include: {
        role: true,
      },
    });

    // Send onboarding credentials email via SMTP using dynamic Email Templates system with fallback
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const loginUrl = `${frontendUrl}/login`;
      const settings: any = await this.settingsService.getAllSettings().catch(() => ({}));
      const supportEmail = settings.support_email || 'support@hartek.com';
      const dateTimeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      const subject = `Welcome to HARTEK CMD Dashboard - Your Account Credentials`;
      const content = `Hello ${user.name},

Your user profile has been created on the HARTEK CMD Dashboard.

Here are your account credentials:
- Login URL: ${loginUrl}
- Email/Username: ${user.email}
- Password: ${tempPassword}

${isTempPassword ? 'Note: You have been assigned a temporary password. You will be required to change it immediately upon your first login.' : 'Please use the password provided by your administrator to sign in.'}

Thank you`;

      await this.settingsMailer.sendTemplateEmail(
        user.email,
        'USER_CREATED',
        {
          user_name: user.name,
          user_email: user.email,
          temporary_password: tempPassword,
          login_url: loginUrl,
          company_name: 'HARTEK Group',
          is_temp_password: isTempPassword,
          support_email: supportEmail,
          date_time: dateTimeStr,
        },
        subject,
        content,
      );
      console.log(`[USER CREATION EMAIL] Sent credentials to ${user.email}`);
    } catch (err) {
      console.error(`[USER CREATION EMAIL ERROR] Failed to send email:`, err);
    }

    return user;
  }

  async update(id: string, dto: any, actorId: string, actorEmail: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) {
      throw new NotFoundException('User profile not found.');
    }

    // 1. Prevent self-deactivation or self-role-change (losing admin privileges)
    if (id === actorId || user.email === actorEmail) {
      if (dto.active === false) {
        throw new BadRequestException('You cannot deactivate your own logged-in user account.');
      }

      const oldRoleName = user.role?.name;
      const newRole = dto.roleId ? await this.prisma.role.findUnique({ where: { id: dto.roleId } }) : null;
      const newRoleName = newRole?.name;

      const wasAdmin = oldRoleName === 'Admin';
      const willBeAdmin = newRoleName === 'Admin';

      if (wasAdmin && !willBeAdmin) {
        throw new BadRequestException('You cannot change your own role to a non-administrator role.');
      }
    }

    // 2. Prevent deactivating or changing role of the last remaining active administrator
    const wasAdmin = user.role?.name === 'Admin';
    if (wasAdmin) {
      const newRole = dto.roleId ? await this.prisma.role.findUnique({ where: { id: dto.roleId } }) : null;
      const willBeAdmin = newRole?.name === 'Admin';

      const isDeactivating = dto.active === false;
      const isLosingAdminRole = !willBeAdmin;

      if (isDeactivating || isLosingAdminRole) {
        const otherAdminsCount = await this.prisma.user.count({
          where: {
            id: { not: id },
            deletedAt: null,
            active: true,
            role: {
              name: 'Admin',
            },
          },
        });

        if (otherAdminsCount === 0) {
          throw new BadRequestException(
            'Cannot deactivate or change the role of the last remaining active administrator in the system.',
          );
        }
      }
    }

    const updateData: any = {
      name: dto.name,
      roleId: dto.roleId === '' ? null : dto.roleId,
      managerId: dto.managerId === '' || !dto.managerId ? null : dto.managerId,
      active: dto.active,
    };

    if (dto.password) {
      updateData.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    // Send status change notification email if account active status changed
    if (dto.active !== undefined && dto.active !== user.active) {
      try {
        const settings: any = await this.settingsService.getAllSettings().catch(() => ({}));
        const supportEmail = settings.support_email || 'support@hartek.com';
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const dateTimeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        if (dto.active === true) {
          await this.settingsMailer.sendTemplateEmail(
            updatedUser.email,
            'ACCOUNT_ACTIVATED',
            {
              user_name: updatedUser.name,
              user_email: updatedUser.email,
              login_url: `${frontendUrl}/login`,
              company_name: 'HARTEK Group',
              support_email: supportEmail,
              date_time: dateTimeStr,
            },
            'Your Account Has Been Activated - HARTEK CMD Dashboard',
            `Hello ${updatedUser.name},\n\nYour HARTEK CMD account (${updatedUser.email}) has been activated.\n\nLogin Portal: ${frontendUrl}/login`,
          );
        } else if (dto.active === false) {
          await this.settingsMailer.sendTemplateEmail(
            updatedUser.email,
            'ACCOUNT_DEACTIVATED',
            {
              user_name: updatedUser.name,
              user_email: updatedUser.email,
              company_name: 'HARTEK Group',
              support_email: supportEmail,
              date_time: dateTimeStr,
            },
            'Notice: Your HARTEK CMD Account Access Has Been Deactivated',
            `Hello ${updatedUser.name},\n\nPlease be advised that your HARTEK CMD account access (${updatedUser.email}) has been deactivated by system administration.`,
          );
        }
      } catch (err) {
        console.error('[ACCOUNT STATUS CHANGE EMAIL ERROR]', err);
      }
    }

    return updatedUser;
  }

  async resetPasswordTemp(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User profile not found.');
    }

    // Generate random 12-char temp password key
    const tempPassword = Math.random().toString(36).substring(2, 8) + Math.random().toString(36).substring(2, 8).toUpperCase();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        requiresPasswordReset: true,
      },
    });

    const settings: any = await this.settingsService.getAllSettings().catch(() => ({}));
    const supportEmail = settings.support_email || 'support@hartek.com';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const dateTimeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // Send temporary password to user via SMTP using template mailer
    const defaultSubject = 'HARTEK CMD - Temporary Password Key Reset';
    const defaultText = `Hello ${user.name},\n\nAn administrator has reset your password credentials.\n\nYour Temporary Password Key is: ${tempPassword}\n\nYou will be required to configure a new secure password on your next login.`;
    
    const emailSent = await this.settingsMailer.sendTemplateEmail(
      user.email,
      'PASSWORD_CHANGED',
      {
        user_name: user.name,
        user_email: user.email,
        temporary_password: tempPassword,
        company_name: 'HARTEK Group',
        date_time: dateTimeStr,
        support_email: supportEmail,
        login_url: `${frontendUrl}/login`,
      },
      defaultSubject,
      defaultText,
    );

    console.log(`[TEMP PASSWORD RESET] User: ${user.email} | Key: ${tempPassword}`);

    return {
      success: true,
      tempPassword,
      emailSent,
      message: emailSent
        ? `Temporary password (${tempPassword}) generated and emailed to ${user.email}.`
        : `Temporary password generated: "${tempPassword}". (Note: Email delivery failed due to SMTP settings. Please share this key manually.)`
    };
  }

  async remove(id: string, actorId: string, actorEmail: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!user) {
      throw new NotFoundException('User profile not found.');
    }

    // 1. Prevent self-deletion
    if (id === actorId || user.email === actorEmail) {
      throw new BadRequestException('You cannot delete your own logged-in user account.');
    }

    // 2. Prevent deleting the last administrator
    const isAdminLevel = user.role?.name === 'Admin';
    if (isAdminLevel) {
      const otherAdminsCount = await this.prisma.user.count({
        where: {
          id: { not: id },
          deletedAt: null,
          active: true,
          role: {
            name: 'Admin',
          },
        },
      });

      if (otherAdminsCount === 0) {
        throw new BadRequestException(
          'Cannot delete the last remaining active administrator account in the system.',
        );
      }
    }

    // 3. Clear managerId for any users that report to this user
    await this.prisma.user.updateMany({
      where: { managerId: id },
      data: { managerId: null },
    });

    // 4. Perform true permanent delete
    return this.prisma.user.delete({
      where: { id },
    });
  }

  async findSessionLogs(actorRole: string) {
    if (actorRole !== 'Admin') {
      throw new BadRequestException('Only administrators can view session logs');
    }
    return this.prisma.userSessionLog.findMany({
      orderBy: { loginTime: 'desc' },
      include: {
        user: {
          select: {
            initials: true,
          }
        }
      }
    });
  }

  async getAdminStats(actorRole: string) {
    if (actorRole !== 'Admin') {
      throw new BadRequestException('Only administrators can access statistics');
    }

    const totalUsers = await this.prisma.user.count();

    // Find all users and determine if they are logged in based on active Sessions
    const allUsers = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        initials: true,
        active: true,
        role: {
          select: {
            name: true,
          },
        },
        sessions: {
          select: {
            id: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const usersWithStatus = allUsers.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      initials: user.initials,
      active: user.active,
      roleName: user.role ? user.role.name : 'No Role Assigned',
      isLoggedIn: user.sessions.length > 0,
    }));

    const activeUsers = usersWithStatus.filter(u => u.isLoggedIn).length;

    // Get latest 4 logs
    const latestLogs = await this.prisma.userSessionLog.findMany({
      take: 4,
      orderBy: { loginTime: 'desc' },
      include: {
        user: {
          select: {
            initials: true,
          }
        }
      }
    });

    return {
      totalUsers,
      activeUsers,
      usersWithStatus,
      latestLogs,
    };
  }
}
