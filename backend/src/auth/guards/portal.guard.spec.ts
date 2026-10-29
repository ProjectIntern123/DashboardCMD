import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PortalGuard } from './portal.guard';
import { PortalScope, PORTAL_SCOPE_KEY } from '../decorators/portal.decorator';

describe('PortalGuard - Legacy Super Admin Compatibility & Scope Enforcement', () => {
  let guard: PortalGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PortalGuard(reflector);
  });

  const createMockContext = (user: any, scope?: PortalScope): ExecutionContext => {
    const handler = () => {};
    const targetClass = class {};

    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
      if (key === PORTAL_SCOPE_KEY) {
        return scope;
      }
      return undefined;
    });

    return {
      getHandler: () => handler,
      getClass: () => targetClass,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  describe('Unauthenticated Requests', () => {
    it('throws UnauthorizedException when no user is attached to the request on scoped endpoint', () => {
      const ctx = createMockContext(null, PortalScope.ADMIN);
      expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    });

    it('allows through when scope is not set or is SHARED even without user', () => {
      const ctxUnscoped = createMockContext(null, undefined);
      expect(guard.canActivate(ctxUnscoped)).toBe(true);

      const ctxShared = createMockContext(null, PortalScope.SHARED);
      expect(guard.canActivate(ctxShared)).toBe(true);
    });
  });

  describe('Admin Portal Scope (PortalScope.ADMIN)', () => {
    it('allows access for canonical "Admin" accounts', () => {
      const ctx = createMockContext({ id: 'usr-admin', role: 'Admin' }, PortalScope.ADMIN);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows access for legacy "Super Admin" accounts (compatibility rule)', () => {
      const ctx = createMockContext({ id: 'usr-super-admin', role: 'Super Admin' }, PortalScope.ADMIN);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks access with ForbiddenException for non-admin accounts ("Employee")', () => {
      const ctx = createMockContext({ id: 'usr-emp', role: 'Employee' }, PortalScope.ADMIN);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow('Access restricted to Admin portal users only');
    });

    it('blocks access with ForbiddenException for "Manager" accounts', () => {
      const ctx = createMockContext({ id: 'usr-mgr', role: 'Manager' }, PortalScope.ADMIN);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('Business User Portal Scope (PortalScope.USER)', () => {
    it('allows access for standard business users ("Employee")', () => {
      const ctx = createMockContext({ id: 'usr-emp', role: 'Employee' }, PortalScope.USER);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows access for "Manager" accounts', () => {
      const ctx = createMockContext({ id: 'usr-mgr', role: 'Manager' }, PortalScope.USER);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks canonical "Admin" accounts from accessing business workflow endpoints', () => {
      const ctx = createMockContext({ id: 'usr-admin', role: 'Admin' }, PortalScope.USER);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow(
        'Administrators cannot access business workflow endpoints. Please use a business account.',
      );
    });

    it('blocks legacy "Super Admin" accounts from accessing business workflow endpoints', () => {
      const ctx = createMockContext({ id: 'usr-super-admin', role: 'Super Admin' }, PortalScope.USER);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(ctx)).toThrow(
        'Administrators cannot access business workflow endpoints. Please use a business account.',
      );
    });
  });

  describe('Shared Portal Scope (PortalScope.SHARED)', () => {
    it('allows access for Admin, Super Admin, and business users', () => {
      const ctxAdmin = createMockContext({ id: 'usr-admin', role: 'Admin' }, PortalScope.SHARED);
      expect(guard.canActivate(ctxAdmin)).toBe(true);

      const ctxSuperAdmin = createMockContext({ id: 'usr-super', role: 'Super Admin' }, PortalScope.SHARED);
      expect(guard.canActivate(ctxSuperAdmin)).toBe(true);

      const ctxEmp = createMockContext({ id: 'usr-emp', role: 'Employee' }, PortalScope.SHARED);
      expect(guard.canActivate(ctxEmp)).toBe(true);
    });
  });
});
