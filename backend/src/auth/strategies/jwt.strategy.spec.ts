import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';

describe('JwtStrategy - Legacy Super Admin Role Normalization', () => {
  let strategy: JwtStrategy;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    strategy = new JwtStrategy(mockPrisma as unknown as PrismaService);
  });

  it('normalizes legacy "Super Admin" role to canonical "Admin" upon token validation', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'usr-super-admin-01',
      email: 'superadmin@hartek.com',
      name: 'Super Administrator',
      initials: 'SA',
      active: true,
      deletedAt: null,
      departmentId: null,
      requiresPasswordReset: false,
      role: {
        name: 'Super Admin',
        permissions: [
          {
            permission: { action: 'MANAGE', resource: 'ALL' },
          },
        ],
      },
    });

    const validatedUser = await strategy.validate({ sub: 'usr-super-admin-01', email: 'superadmin@hartek.com' });

    expect(validatedUser.role).toBe('Admin');
    expect(validatedUser.id).toBe('usr-super-admin-01');
    expect(validatedUser.permissions).toEqual([{ action: 'MANAGE', resource: 'ALL' }]);
  });

  it('preserves canonical "Admin" role unchanged upon token validation', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'usr-admin-01',
      email: 'admin@hartek.com',
      name: 'Canonical Admin',
      initials: 'CA',
      active: true,
      deletedAt: null,
      departmentId: null,
      requiresPasswordReset: false,
      role: {
        name: 'Admin',
        permissions: [],
      },
    });

    const validatedUser = await strategy.validate({ sub: 'usr-admin-01', email: 'admin@hartek.com' });

    expect(validatedUser.role).toBe('Admin');
  });

  it('preserves ordinary business roles (e.g. "Employee") unchanged', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'usr-emp-01',
      email: 'employee@hartek.com',
      name: 'Standard Employee',
      initials: 'SE',
      active: true,
      deletedAt: null,
      departmentId: 'dept-1',
      requiresPasswordReset: false,
      role: {
        name: 'Employee',
        permissions: [],
      },
    });

    const validatedUser = await strategy.validate({ sub: 'usr-emp-01', email: 'employee@hartek.com' });

    expect(validatedUser.role).toBe('Employee');
  });

  it('throws UnauthorizedException when user is inactive or deleted', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'usr-inactive',
      active: false,
      deletedAt: null,
    });

    await expect(strategy.validate({ sub: 'usr-inactive' })).rejects.toThrow(UnauthorizedException);

    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'usr-deleted',
      active: true,
      deletedAt: new Date(),
    });

    await expect(strategy.validate({ sub: 'usr-deleted' })).rejects.toThrow(UnauthorizedException);
  });
});
