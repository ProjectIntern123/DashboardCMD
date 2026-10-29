import { BadRequestException } from '@nestjs/common';
import { RecipientValidator } from './recipient-validator';
import { PrismaService } from '../../prisma/prisma.service';

describe('RecipientValidator - Administrator Account Rejection & Legacy Super Admin Safety', () => {
  let validator: RecipientValidator;
  let mockPrisma: any;

  const validUuid1 = 'a1111111-1111-4111-8111-111111111111';
  const validUuid2 = 'b2222222-2222-4222-8222-222222222222';
  const adminUuid = 'c3333333-3333-4333-8333-333333333333';
  const superAdminUuid = 'd4444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    mockPrisma = {
      user: {
        findMany: jest.fn(),
      },
    };
    validator = new RecipientValidator(mockPrisma as unknown as PrismaService);
  });

  describe('validateInternalUserIds()', () => {
    it('throws BadRequestException if empty or invalid input is passed', async () => {
      await expect(validator.validateInternalUserIds([])).rejects.toThrow(BadRequestException);
      await expect(validator.validateInternalUserIds(null as any)).rejects.toThrow('At least one assignee is required');
      await expect(validator.validateInternalUserIds(['invalid-uuid-format'])).rejects.toThrow(
        "Assignee ID 'invalid-uuid-format' is not a valid UUID format",
      );
    });

    it('successfully validates non-admin user UUIDs', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: validUuid1, role: { name: 'Employee' } },
        { id: validUuid2, role: { name: 'Manager' } },
      ]);

      const result = await validator.validateInternalUserIds([validUuid1, validUuid2]);
      expect(result).toEqual([validUuid1, validUuid2]);
    });

    it('rejects assignment when assignee has canonical "Admin" role', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: validUuid1, role: { name: 'Employee' } },
        { id: adminUuid, role: { name: 'Admin' } },
      ]);

      await expect(validator.validateInternalUserIds([validUuid1, adminUuid])).rejects.toThrow(
        'Tasks cannot be assigned to Administrator accounts',
      );
    });

    it('rejects assignment when assignee has legacy "Super Admin" role', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: validUuid1, role: { name: 'Employee' } },
        { id: superAdminUuid, role: { name: 'Super Admin' } },
      ]);

      await expect(validator.validateInternalUserIds([validUuid1, superAdminUuid])).rejects.toThrow(
        'Tasks cannot be assigned to Administrator accounts',
      );
    });
  });

  describe('validateMixedRecipients()', () => {
    it('returns empty array when input is null, undefined, or empty', async () => {
      expect(await validator.validateMixedRecipients(null)).toEqual([]);
      expect(await validator.validateMixedRecipients(undefined)).toEqual([]);
      expect(await validator.validateMixedRecipients([])).toEqual([]);
      expect(await validator.validateMixedRecipients('')).toEqual([]);
    });

    it('preserves valid external emails and non-admin employee UUIDs', async () => {
      mockPrisma.user.findMany.mockImplementation(({ where }: any) => {
        if (where.id) {
          return Promise.resolve([{ id: validUuid1, role: { name: 'Employee' } }]);
        }
        if (where.role) {
          return Promise.resolve([
            { email: 'admin@hartek.com' },
            { email: 'superadmin@hartek.com' },
          ]);
        }
        return Promise.resolve([]);
      });

      const input = [validUuid1, 'vendor.partner@external.org'];
      const result = await validator.validateMixedRecipients(input);

      expect(result).toContain(validUuid1);
      expect(result).toContain('vendor.partner@external.org');
    });

    it('rejects mixed recipient containing an Admin UUID', async () => {
      mockPrisma.user.findMany.mockImplementation(({ where }: any) => {
        if (where.id) {
          return Promise.resolve([{ id: adminUuid, role: { name: 'Admin' } }]);
        }
        return Promise.resolve([]);
      });

      await expect(validator.validateMixedRecipients([adminUuid])).rejects.toThrow(
        'Records cannot be assigned to Administrator accounts',
      );
    });

    it('rejects mixed recipient containing a legacy Super Admin UUID', async () => {
      mockPrisma.user.findMany.mockImplementation(({ where }: any) => {
        if (where.id) {
          return Promise.resolve([{ id: superAdminUuid, role: { name: 'Super Admin' } }]);
        }
        return Promise.resolve([]);
      });

      await expect(validator.validateMixedRecipients([superAdminUuid])).rejects.toThrow(
        'Records cannot be assigned to Administrator accounts',
      );
    });

    it('rejects candidate email matching canonical Admin email', async () => {
      mockPrisma.user.findMany.mockImplementation(({ where }: any) => {
        if (where.role) {
          return Promise.resolve([{ email: 'admin@hartek.com' }]);
        }
        return Promise.resolve([]);
      });

      await expect(
        validator.validateMixedRecipients(['admin@hartek.com', 'vendor@partner.org']),
      ).rejects.toThrow('Records cannot be assigned to Administrator accounts');
    });

    it('rejects candidate email matching legacy Super Admin email (case-insensitive)', async () => {
      mockPrisma.user.findMany.mockImplementation(({ where }: any) => {
        if (where.role) {
          return Promise.resolve([{ email: 'legacy.superadmin@hartek.com' }]);
        }
        return Promise.resolve([]);
      });

      await expect(
        validator.validateMixedRecipients(['LEGACY.SUPERADMIN@HARTEK.COM']),
      ).rejects.toThrow('Records cannot be assigned to Administrator accounts');
    });
  });
});
