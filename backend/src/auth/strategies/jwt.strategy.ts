import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is missing in production!');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: Request) => {
          return request?.cookies?.accessToken || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: secret || 'hartek_cmd_super_secure_access_token_secret_key_2026',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
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

    if (!user || !user.active) {
      throw new UnauthorizedException('User is inactive or not found');
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('This user account has been soft deleted');
    }

    // Flatten permissions list
    const permissions = user.role
      ? user.role.permissions.map(rp => ({
          action: rp.permission.action,
          resource: rp.permission.resource,
        }))
      : [];

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      initials: user.initials,
      role: user.role ? user.role.name : 'No Role',
      departmentId: user.departmentId,
      requiresPasswordReset: user.requiresPasswordReset,
      permissions,
    };
  }
}
