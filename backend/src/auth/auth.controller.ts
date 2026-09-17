import { Controller, Post, Body, Get, Req, Res, UseGuards, HttpStatus, HttpCode, UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/auth-actions.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const ua = req.headers['user-agent'] || '';

    const result = await this.authService.validateUser(loginDto, ip, ua);

    // If MFA code is required first before issuing tokens
    if ('mfaRequired' in result) {
      return result;
    }

    // Set secure HTTP-only cookies
    const secure = process.env.SECURE_COOKIES === 'true';
    
    // Set Access Token in Cookie
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: loginDto.rememberMe ? 15 * 60 * 1000 : undefined, // session cookie if not rememberMe
    });

    // Set Refresh Token in Cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: loginDto.rememberMe ? 7 * 24 * 60 * 60 * 1000 : undefined, // session cookie if not rememberMe
    });

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Read from cookie
    const token = req.cookies?.refreshToken;
    if (!token) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const result = await this.authService.refresh(token);

    // Set updated Access Token cookie
    const secure = process.env.SECURE_COOKIES === 'true';
    res.cookie('accessToken', result.accessToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.refreshToken;
    await this.authService.logout(token);

    // Clear cookies
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });

    return { message: 'Logged out successfully' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password-temp')
  @HttpCode(HttpStatus.OK)
  async changePasswordTemp(
    @GetUser() user: any,
    @Body() body: any,
  ) {
    if (!body.newPassword) {
      throw new BadRequestException('New password is required');
    }
    return this.authService.changePasswordTemp(user.id, body.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@GetUser() user: any) {
    return user;
  }
}
