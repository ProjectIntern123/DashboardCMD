import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PORTAL_SCOPE_KEY, PortalScope } from '../decorators/portal.decorator';

@Injectable()
export class PortalGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScope = this.reflector.getAllAndOverride<PortalScope>(PORTAL_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no scope is set or scope is SHARED, allow through
    if (!requiredScope || requiredScope === PortalScope.SHARED) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const isAdmin = user.role === 'Admin';

    if (requiredScope === PortalScope.ADMIN) {
      if (!isAdmin) {
        throw new ForbiddenException('Access restricted to Admin portal users only');
      }
      return true;
    }

    if (requiredScope === PortalScope.USER) {
      if (isAdmin) {
        throw new ForbiddenException('Administrators cannot access business workflow endpoints. Please use a business account.');
      }
      return true;
    }

    return true;
  }
}
