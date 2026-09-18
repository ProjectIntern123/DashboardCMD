import { Injectable, UnauthorizedException, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/auth-actions.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { SettingsMailer } from '../settings/settings.mailer';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private settingsMailer: SettingsMailer,
    private settingsService: SettingsService,
  ) {}

  async validateUser(loginDto: LoginDto, ipAddress: string, userAgent: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('This account has been soft deleted');
    }

    if (!user.active) {
      throw new ForbiddenException('This account is deactivated');
    }

    // Check account lockout status
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      
      // Log failed attempts history
      await this.logLoginAttempt(user.id, ipAddress, userAgent, 'FAILED', `Account locked. Re-try in ${remainingMinutes}m.`);
      
      throw new ForbiddenException(`Account is locked due to multiple failed login attempts. Please try again in ${remainingMinutes} minutes.`);
    }

    // Verify Password
    const passwordMatch = await bcrypt.compare(loginDto.password, user.passwordHash);

    if (!passwordMatch) {
      await this.handleFailedLoginAttempt(user, ipAddress, userAgent);
      throw new UnauthorizedException('Invalid credentials');
    }

    // If MFA / OTP login is required or optional and supplied
    if (user.mfaEnabled || loginDto.otp) {
      if (!loginDto.otp) {
        // Generate and send code
        const otpCode = crypto.randomInt(100000, 999999).toString(); // 6 digits
        const otpExpiresAt = new Date(Date.now() + 5 * 60000); // 5 mins expiry
        
        await this.prisma.user.update({
          where: { id: user.id },
          data: { otpCode, otpExpiresAt },
        });

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const settings: any = await this.settingsService.getAllSettings().catch(() => ({}));
        const supportEmail = settings.support_email || 'support@hartek.com';
        const dateTimeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        // Send actual email via Microsoft SMTP using dynamic Email Templates
        await this.settingsMailer.sendTemplateEmail(
          user.email,
          'MFA_OTP',
          {
            user_name: user.name,
            user_email: user.email,
            otp_code: otpCode,
            otp_expires_in: '5',
            login_url: `${frontendUrl}/login`,
            company_name: 'HARTEK Group',
            support_email: supportEmail,
            date_time: dateTimeStr,
          },
        );

        // SIMULATION ONLY: Log OTP code in backend console for developer visibility
        console.log(`[MFA OTP SENT] User: ${user.email} | Code: ${otpCode} | Expires: 5 mins`);

        return {
          mfaRequired: true,
          email: user.email,
          message: 'OTP verification code has been sent to your email',
        };
      }

      // Verify OTP Code
      if (!user.otpCode || !user.otpExpiresAt || user.otpExpiresAt < new Date() || user.otpCode !== loginDto.otp) {
        await this.logLoginAttempt(user.id, ipAddress, userAgent, 'FAILED', 'Invalid/expired OTP code');
        throw new UnauthorizedException('Invalid or expired OTP code');
      }

      // Clear OTP code on success
      await this.prisma.user.update({
        where: { id: user.id },
        data: { otpCode: null, otpExpiresAt: null },
      });
    }

    // Reset failed login attempts on success
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    }

    // Register device and login history records
    await this.registerDeviceTrack(user.id, ipAddress, userAgent);
    await this.logLoginAttempt(user.id, ipAddress, userAgent, 'SUCCESS');

    // Create session log entry
    await this.prisma.userSessionLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        ipAddress,
        userAgent,
      },
    });

    // Create payload
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role ? user.role.name : 'No Role',
      name: user.name,
      requiresPasswordReset: user.requiresPasswordReset,
    };

    const permissions = user.role
      ? user.role.permissions.map(rp => ({
          action: rp.permission.action,
          resource: rp.permission.resource,
        }))
      : [];

    return this.generateTokens(payload, permissions);
  }

  async generateTokens(payload: JwtPayload, permissions: any[] = []) {
    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_SECRET || 'hartek_cmd_super_secure_access_token_secret_key_2026',
      expiresIn: (process.env.JWT_ACCESS_EXPIRATION || '15m') as any,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'hartek_cmd_super_secure_refresh_token_secret_key_2026',
      expiresIn: (process.env.JWT_REFRESH_EXPIRATION || '7d') as any,
    });

    // Save refreshToken session in DB
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await this.prisma.session.create({
      data: {
        userId: payload.sub,
        token: refreshToken,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        name: payload.name,
        requiresPasswordReset: payload.requiresPasswordReset || false,
        permissions,
      },
    };
  }

  async refresh(token: string) {
    // Check if session exists in DB
    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: { include: { role: true } } },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.prisma.session.delete({ where: { id: session.id } });
      }
      throw new UnauthorizedException('Refresh token has expired or is invalid');
    }

    // Verify token
    try {
      const decoded = this.jwtService.verify<JwtPayload>(token, {
        secret: process.env.JWT_REFRESH_SECRET || 'hartek_cmd_super_secure_refresh_token_secret_key_2026',
      });

      const payload: JwtPayload = {
        sub: session.user.id,
        email: session.user.email,
        role: session.user.role ? session.user.role.name : 'No Role',
        name: session.user.name,
        requiresPasswordReset: session.user.requiresPasswordReset,
      };

      // Generate new access token
      const accessToken = this.jwtService.sign(payload, {
        secret: process.env.JWT_SECRET || 'hartek_cmd_super_secure_access_token_secret_key_2026',
        expiresIn: (process.env.JWT_ACCESS_EXPIRATION || '15m') as any,
      });

      return { accessToken };
    } catch (err) {
      await this.prisma.session.delete({ where: { id: session.id } });
      throw new UnauthorizedException('Refresh token is invalid');
    }
  }

  async logout(refreshToken: string) {
    if (refreshToken) {
      const session = await this.prisma.session.findUnique({
        where: { token: refreshToken },
      });
      if (session) {
        // Update UserSessionLog set logoutTime
        const latestLog = await this.prisma.userSessionLog.findFirst({
          where: { userId: session.userId, logoutTime: null },
          orderBy: { loginTime: 'desc' },
        });
        if (latestLog) {
          await this.prisma.userSessionLog.update({
            where: { id: latestLog.id },
            data: { logoutTime: new Date() },
          });
        }
        await this.prisma.session.delete({
          where: { id: session.id },
        });
      }
    }
    return { message: 'Successfully logged out' };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: forgotPasswordDto.email },
    });

    // Uniform response regardless of email existence to prevent user enumeration
    if (!user || user.deletedAt) {
      return {
        message: 'If the email address is registered, a password reset OTP code and verification link have been sent.',
      };
    }

    // Generate password reset OTP
    const otpCode = crypto.randomInt(100000, 999999).toString(); // 6 digits
    const otpExpiresAt = new Date(Date.now() + 15 * 60000); // 15 mins expiry

    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpCode, otpExpiresAt },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/forgot-password?email=${encodeURIComponent(user.email)}&otpSent=true`;
    const settings: any = await this.settingsService.getAllSettings().catch(() => ({}));
    const supportEmail = settings.support_email || 'support@hartek.com';
    const dateTimeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const emailBody = `Hello ${user.name},\n\n` +
      `Your One-Time Password Reset Code is: ${otpCode}\n\n` +
      `You can enter this verification code directly on the recovery form or click the link below:\n` +
      `${resetUrl}\n\n` +
      `This code expires in 15 minutes. If you did not request a password reset, please ignore this email.`;

    const emailHtml = `<div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">` +
      `<h2 style="color: #0f2a4a; margin-top: 0;">HARTEK CMD - Password Reset Request</h2>` +
      `<p>Hello <strong>${user.name}</strong>,</p>` +
      `<p>Your One-Time Password Verification Code is:</p>` +
      `<div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #ef9f27; padding: 12px; background: #f8fafc; text-align: center; border-radius: 6px; margin: 16px 0;">${otpCode}</div>` +
      `<p>You can enter this verification code on the recovery form or click the button below:</p>` +
      `<p style="text-align: center; margin: 24px 0;"><a href="${resetUrl}" style="background-color: #0f2a4a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Your Password</a></p>` +
      `<p style="font-size: 12px; color: #64748b; margin-top: 24px;">This code expires in 15 minutes. If you did not request this, no action is needed.</p>` +
      `</div>`;

    // Send actual email via configured SMTP using dynamic Email Templates system with fallback
    const emailSent = await this.settingsMailer.sendTemplateEmail(
      user.email,
      'PASSWORD_RESET',
      {
        user_name: user.name,
        user_email: user.email,
        otp_code: otpCode,
        otp_expires_in: '15',
        reset_link: resetUrl,
        login_url: `${frontendUrl}/login`,
        company_name: 'HARTEK Group',
        support_email: supportEmail,
        date_time: dateTimeStr,
      },
    );

    console.log(`[PASSWORD RESET OTP] User: ${user.email} | Code: ${otpCode} | Sent: ${emailSent} | Expires: 15 mins`);

    return {
      success: true,
      emailSent,
      devOtp: !emailSent || process.env.NODE_ENV !== 'production' ? otpCode : undefined,
      message: emailSent
        ? 'A password reset OTP code and verification link have been sent to your email.'
        : `Password reset OTP generated (${otpCode}). (Note: Email delivery failed due to unconfigured SMTP settings).`,
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: resetPasswordDto.email },
    });

    if (!user || user.deletedAt || !user.otpCode || !user.otpExpiresAt || user.otpExpiresAt < new Date() || user.otpCode !== resetPasswordDto.otp) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(resetPasswordDto.newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        otpCode: null,
        otpExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Invalidate existing active sessions for security
    await this.prisma.session.deleteMany({
      where: { userId: user.id },
    });

    // Send confirmation email
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const settings: any = await this.settingsService.getAllSettings().catch(() => ({}));
      const supportEmail = settings.support_email || 'support@hartek.com';
      const dateTimeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      await this.settingsMailer.sendTemplateEmail(
        user.email,
        'PASSWORD_CHANGED',
        {
          user_name: user.name,
          user_email: user.email,
          company_name: 'HARTEK Group',
          support_email: supportEmail,
          date_time: dateTimeStr,
          login_url: `${frontendUrl}/login`,
        },
      );
    } catch (err) {
      console.error('[PASSWORD CHANGED EMAIL ERROR]', err);
    }

    return {
      message: 'Password has been reset successfully. Please log in with your new password.',
    };
  }

  async changePasswordTemp(userId: string, newPassword: string) {
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        requiresPasswordReset: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Send confirmation email
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const settings: any = await this.settingsService.getAllSettings().catch(() => ({}));
      const supportEmail = settings.support_email || 'support@hartek.com';
      const dateTimeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      await this.settingsMailer.sendTemplateEmail(
        user.email,
        'PASSWORD_CHANGED',
        {
          user_name: user.name,
          user_email: user.email,
          company_name: 'HARTEK Group',
          support_email: supportEmail,
          date_time: dateTimeStr,
          login_url: `${frontendUrl}/login`,
        },
      );
    } catch (err) {
      console.error('[PASSWORD CHANGED EMAIL ERROR]', err);
    }

    return {
      message: 'Password changed successfully.',
    };
  }

  // -------------------------------------------------------------------------
  // PRIVATE SECURITY HELPERS
  // -------------------------------------------------------------------------

  private async handleFailedLoginAttempt(user: any, ipAddress: string, userAgent: string) {
    const attempts = user.failedLoginAttempts + 1;
    const maxAttempts = 5;
    let lockedUntil: Date | null = null;
    let message = 'Invalid password credentials';

    if (attempts >= maxAttempts) {
      const lockoutMinutes = 15;
      lockedUntil = new Date(Date.now() + lockoutMinutes * 60000);
      message = `Account temporarily locked for ${lockoutMinutes} mins after ${maxAttempts} consecutive failures.`;
      console.warn(`[ACCOUNT LOCKED] Locked user: ${user.email} from IP: ${ipAddress}`);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil,
      },
    });

    await this.logLoginAttempt(user.id, ipAddress, userAgent, 'FAILED', message);
  }

  private async logLoginAttempt(userId: string, ipAddress: string, userAgent: string, status: 'SUCCESS' | 'FAILED', failureReason?: string) {
    const browser = this.extractBrowser(userAgent);
    const device = this.extractDevice(userAgent);

    await this.prisma.loginHistory.create({
      data: {
        userId,
        ipAddress,
        browser,
        device,
        status,
        failureReason,
      },
    });
  }

  private async registerDeviceTrack(userId: string, ipAddress: string, userAgent: string) {
    const deviceName = `${this.extractDevice(userAgent)} (${this.extractBrowser(userAgent)})`;
    const deviceId = Buffer.from(`${userId}-${deviceName}`).toString('base64').substring(0, 32);

    await this.prisma.deviceTrack.upsert({
      where: { id: deviceId }, // Will fail if id isn't unique, so let's check or handle manually
      update: {
        lastIp: ipAddress,
        lastActive: new Date(),
      },
      create: {
        id: deviceId,
        userId,
        deviceId,
        deviceName,
        lastIp: ipAddress,
        lastActive: new Date(),
      },
    }).catch(() => {
      // If composite unique check fails on id, fall back to simple update
      return this.prisma.deviceTrack.create({
        data: {
          userId,
          deviceId,
          deviceName,
          lastIp: ipAddress,
        },
      });
    });
  }

  private extractBrowser(ua: string): string {
    if (!ua) return 'Unknown';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Chrome') && !ua.includes('Chromium')) return 'Chrome';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Browser';
  }

  private extractDevice(ua: string): string {
    if (!ua) return 'Unknown';
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('Android')) return 'Android Mobile';
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Macintosh')) return 'Macbook/Mac';
    if (ua.includes('Linux')) return 'Linux Station';
    return 'Workstation';
  }
}
