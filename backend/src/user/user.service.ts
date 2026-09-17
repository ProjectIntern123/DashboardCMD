import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { SettingsMailer } from '../settings/settings.mailer';

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private settingsMailer: SettingsMailer,
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
        roleId: true,
        departmentId: true,
        managerId: true,
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        createdAt: true,
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: any) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new BadRequestException('A profile with this email already exists.');
    }

    const isTempPassword = !dto.password;
    const tempPassword = dto.password || require('crypto').randomBytes(6).toString('hex');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(tempPassword, saltRounds);

    // Compute initials from name
    const initials = dto.name
      .split(' ')
      .map((part: string) => part[0])
      .join('')
      .substring(0, 3)
      .toUpperCase() || 'US';

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        initials,
        passwordHash,
        roleId: dto.roleId || null,
        managerId: dto.managerId || null,
        active: dto.active !== undefined ? dto.active : true,
        requiresPasswordReset: isTempPassword,
      },
    });

    // Send credentials email
    try {
      const loginUrl = process.env.FRONTEND_URL || 'cmd.hartek.tech';
      const subject = 'Welcome to HARTEK CMD Dashboard - Your Credentials';
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

    return this.prisma.user.update({
      where: { id },
      data: updateData,
    });
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
        date_time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        support_email: 'support@hartek.com',
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
