import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No specific permissions mapped, route is open (just requires authentication)
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false; // Not authenticated
    }

    // Admin has universal access
    if (user.role === 'Admin') {
      return true;
    }

    if (!user.permissions) {
      return false; // No permissions list loaded
    }

    // Evaluate permissions. User must have all permissions specified.
    return requiredPermissions.every(reqPerm => {
      const [reqAction, reqResource] = reqPerm.split(':');
      
      return user.permissions.some(
        (p: { action: string; resource: string }) => 
          p.action === reqAction && p.resource === reqResource
      );
    });
  }
}
