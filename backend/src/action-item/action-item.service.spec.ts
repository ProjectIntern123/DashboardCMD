import { Test, TestingModule } from '@nestjs/testing';
import { ActionItemService } from './action-item.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { RecipientValidator } from '../common/utils/recipient-validator';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { RemarkChannel } from './dto/action-item.dto';

describe('ActionItemService - Creator Badges & Remark Channels', () => {
  let service: ActionItemService;
  let mockPrisma: any;
  let mockSettingsService: any;
  let mockRecipientValidator: any;

  const mockActionItem = {
    id: 'action-123',
    item: 'Critical Commissioning Milestone',
    own: 'Rohan Sharma',
    dept: 'Solar EPC',
    pri: 'High',
    st: 'In Progress',
    due: '2026-11-15',
    rem: 'Legacy progress remark from vendor',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-01T10:00:00Z'),
    deletedAt: null,
    attachments: [],
    comments: [],
  };

  const mockCmdUser = {
    id: 'user-cmd-001',
    name: 'Hartek Singh (CMD)',
    email: 'cmd@hartek.com',
    initials: 'HS',
    role: { name: 'CMD' },
  };

  const mockTeamUser = {
    id: 'user-team-002',
    name: 'Ananya Verma',
    email: 'ananya@hartek.com',
    initials: 'AV',
    role: { name: 'Management' },
  };

  const mockAdminUser = {
    id: 'user-admin-003',
    name: 'Pankaj Administrator',
    email: 'admin@hartek.com',
    initials: 'PA',
    role: { name: 'Admin' },
  };

  beforeEach(async () => {
    mockPrisma = {
      actionItem: {
        create: jest.fn().mockResolvedValue(mockActionItem),
        findMany: jest.fn().mockResolvedValue([mockActionItem]),
        findFirst: jest.fn().mockResolvedValue(mockActionItem),
        update: jest.fn(),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id === mockCmdUser.id) return Promise.resolve(mockCmdUser);
          if (where.id === mockTeamUser.id) return Promise.resolve(mockTeamUser);
          if (where.id === mockAdminUser.id) return Promise.resolve(mockAdminUser);
          return Promise.resolve(null);
        }),
      },
      comment: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    mockSettingsService = {
      validateAttachmentSizes: jest.fn().mockResolvedValue(undefined),
    };

    mockRecipientValidator = {
      validateMixedRecipients: jest.fn().mockImplementation((val) => Promise.resolve(val)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionItemService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: RecipientValidator, useValue: mockRecipientValidator },
      ],
    }).compile();

    service = module.get<ActionItemService>(ActionItemService);
  });

  describe('Action Creator Resolution', () => {
    it('attaches trusted database identity of creator on newly created action item', async () => {
      const res = await service.create(
        { item: 'New Directive', own: 'Owner', pri: 'High', st: 'Open' },
        mockTeamUser.id,
      );

      expect(res.creator).toEqual({
        id: mockTeamUser.id,
        name: mockTeamUser.name,
        email: mockTeamUser.email,
      });
    });

    it('resolves creator from creation AuditLog in findAll()', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([
        {
          userId: mockTeamUser.id,
          userName: mockTeamUser.name,
          userEmail: mockTeamUser.email,
          newValues: { id: 'action-123' },
        },
      ]);

      const items = await service.findAll({});
      expect(items[0].creator).toEqual({
        id: mockTeamUser.id,
        name: mockTeamUser.name,
        email: mockTeamUser.email,
      });
    });

    it('returns creator=null for historical action items with no creation audit record (legacy fallback)', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValueOnce([]);

      const items = await service.findAll({});
      expect(items[0].creator).toBeNull();
    });

    it('does not issue an auditLog query when findAll() returns an empty list', async () => {
      mockPrisma.actionItem.findMany.mockResolvedValueOnce([]);
      const items = await service.findAll({});
      expect(items).toEqual([]);
      expect(mockPrisma.auditLog.findMany).not.toHaveBeenCalled();
    });

    it('scopes audit log query to returned action IDs and handles multiple items', async () => {
      const item1 = { ...mockActionItem, id: 'action-1' };
      const item2 = { ...mockActionItem, id: 'action-2' };
      const item3 = { ...mockActionItem, id: 'action-3' };
      mockPrisma.actionItem.findMany.mockResolvedValueOnce([item1, item2, item3]);

      mockPrisma.auditLog.findMany.mockResolvedValueOnce([
        {
          userId: mockTeamUser.id,
          userName: mockTeamUser.name,
          userEmail: mockTeamUser.email,
          newValues: { id: 'action-1' },
        },
        {
          userId: mockCmdUser.id,
          userName: mockCmdUser.name,
          userEmail: mockCmdUser.email,
          newValues: { id: 'action-2' },
        },
        // Unrelated audit entry that shouldn't match any returned item
        {
          userId: 'user-unrelated',
          userName: 'Unrelated User',
          newValues: { id: 'unrelated-action-999' },
        },
      ]);

      const items = await service.findAll({});
      expect(items.length).toBe(3);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: 'Created Action Item',
            OR: [
              { newValues: { path: ['id'], equals: 'action-1' } },
              { newValues: { path: ['id'], equals: 'action-2' } },
              { newValues: { path: ['id'], equals: 'action-3' } },
            ],
          }),
        }),
      );

      expect(items[0].creator).toEqual({
        id: mockTeamUser.id,
        name: mockTeamUser.name,
        email: mockTeamUser.email,
      });

      expect(items[1].creator).toEqual({
        id: mockCmdUser.id,
        name: mockCmdUser.name,
        email: mockCmdUser.email,
      });

      expect(items[2].creator).toBeNull();
    });
  });

  describe('findOne() - Normalization of Remarks & Scoped Creator', () => {
    it('normalizes legacy plain-text comments and channel-encoded remarks without exposing raw JSON envelopes', async () => {
      mockPrisma.actionItem.findFirst.mockResolvedValueOnce({
        ...mockActionItem,
        comments: [
          {
            id: 'comm-10',
            text: JSON.stringify({ channel: 'CMD', text: 'Executive directive for Q4' }),
            createdAt: new Date('2026-10-25T10:00:00Z'),
            updatedAt: new Date('2026-10-25T10:00:00Z'),
            userId: mockCmdUser.id,
            user: mockCmdUser,
          },
          {
            id: 'comm-11',
            text: 'Legacy plain-text remark from earlier version',
            createdAt: new Date('2026-10-20T10:00:00Z'),
            updatedAt: new Date('2026-10-20T10:00:00Z'),
            userId: mockTeamUser.id,
            user: mockTeamUser,
          },
        ],
      });

      mockPrisma.auditLog.findFirst.mockResolvedValueOnce({
        userId: mockTeamUser.id,
        userName: mockTeamUser.name,
        userEmail: mockTeamUser.email,
        newValues: { id: 'action-123' },
      });

      const res = await service.findOne('action-123');

      expect(res.comments.length).toBe(2);

      // Channel-encoded comment is normalized
      expect(res.comments[0].text).toBe('Executive directive for Q4');
      expect(res.comments[0].channel).toBe('CMD');
      expect(res.comments[0].text).not.toContain('{');

      // Legacy plain-text comment is normalized to USER channel
      expect(res.comments[1].text).toBe('Legacy plain-text remark from earlier version');
      expect(res.comments[1].channel).toBe('USER');

      // Creator is resolved via findFirst scoped to action-123
      expect(res.creator).toEqual({
        id: mockTeamUser.id,
        name: mockTeamUser.name,
        email: mockTeamUser.email,
      });
      expect(mockPrisma.auditLog.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: 'Created Action Item',
            newValues: { path: ['id'], equals: 'action-123' },
          }),
        }),
      );
    });
  });

  describe('getRemarks() - Separation of Channels', () => {
    it('separates comments into User Remarks and CMD Remarks channels', async () => {
      mockPrisma.comment.findMany.mockResolvedValueOnce([
        {
          id: 'comm-1',
          text: JSON.stringify({ channel: 'USER', text: 'Site inspection completed on schedule' }),
          createdAt: new Date('2026-10-20T10:00:00Z'),
          user: mockTeamUser,
        },
        {
          id: 'comm-2',
          text: JSON.stringify({ channel: 'CMD', text: 'Accelerate milestone to 5th November' }),
          createdAt: new Date('2026-10-21T12:00:00Z'),
          user: mockCmdUser,
        },
        {
          id: 'comm-3',
          text: 'Legacy unstructured text comment',
          createdAt: new Date('2026-10-18T08:00:00Z'),
          user: mockTeamUser,
        },
      ]);

      const res = await service.getRemarks('action-123');

      expect(res.userRemarks.length).toBe(2);
      expect(res.userRemarks[0].text).toBe('Site inspection completed on schedule');
      expect(res.userRemarks[0].channel).toBe('USER');
      expect(res.userRemarks[0].author.name).toBe('Ananya Verma');

      // Unstructured legacy text falls back to User Remarks safely
      expect(res.userRemarks[1].text).toBe('Legacy unstructured text comment');
      expect(res.userRemarks[1].channel).toBe('USER');

      // CMD channel
      expect(res.cmdRemarks.length).toBe(1);
      expect(res.cmdRemarks[0].text).toBe('Accelerate milestone to 5th November');
      expect(res.cmdRemarks[0].channel).toBe('CMD');
      expect(res.cmdRemarks[0].author.name).toBe('Hartek Singh (CMD)');
      expect(res.cmdRemarks[0].author.role).toBe('CMD');

      // Historical action.rem preserved
      expect(res.legacyRemark).toBe('Legacy progress remark from vendor');
    });
  });

  describe('createRemark() - Role Authorization & Channel Isolation', () => {
    it('allows authorized user to create a User Remark', async () => {
      mockPrisma.comment.create.mockResolvedValueOnce({
        id: 'comm-new-1',
        text: JSON.stringify({ channel: 'USER', text: 'Vendor dispatched equipment' }),
        createdAt: new Date('2026-10-27T10:00:00Z'),
        user: mockTeamUser,
      });

      const res = await service.createRemark(
        'action-123',
        { text: 'Vendor dispatched equipment', channel: RemarkChannel.USER },
        { id: mockTeamUser.id, name: mockTeamUser.name, role: 'Management' },
      );

      expect(res.channel).toBe('USER');
      expect(res.author.name).toBe(mockTeamUser.name);
      expect(mockPrisma.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockTeamUser.id,
            actionItemId: 'action-123',
          }),
        }),
      );
    });

    it('allows canonical CMD role to create a CMD Remark', async () => {
      mockPrisma.comment.create.mockResolvedValueOnce({
        id: 'comm-cmd-1',
        text: JSON.stringify({ channel: 'CMD', text: 'Executive directive: prioritize safety' }),
        createdAt: new Date('2026-10-27T11:00:00Z'),
        user: mockCmdUser,
      });

      const res = await service.createRemark(
        'action-123',
        { text: 'Executive directive: prioritize safety', channel: RemarkChannel.CMD },
        { id: mockCmdUser.id, name: mockCmdUser.name, role: 'CMD' },
      );

      expect(res.channel).toBe('CMD');
      expect(res.author.role).toBe('CMD');
    });

    it('strictly forbids Admin from creating CMD Remarks (technical admin != business CMD)', async () => {
      await expect(
        service.createRemark(
          'action-123',
          { text: 'Admin pretending to be CMD', channel: RemarkChannel.CMD },
          { id: mockAdminUser.id, name: mockAdminUser.name, role: 'Admin' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('strictly forbids other business roles (Management, PA, Viewer) from creating CMD Remarks', async () => {
      await expect(
        service.createRemark(
          'action-123',
          { text: 'Unauthorized directive', channel: RemarkChannel.CMD },
          { id: mockTeamUser.id, name: mockTeamUser.name, role: 'Management' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects empty or whitespace-only remark text', async () => {
      await expect(
        service.createRemark(
          'action-123',
          { text: '   ', channel: RemarkChannel.USER },
          { id: mockTeamUser.id, name: mockTeamUser.name, role: 'Management' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects oversized remark text (> 2000 characters)', async () => {
      const hugeText = 'A'.repeat(2001);
      await expect(
        service.createRemark(
          'action-123',
          { text: hugeText, channel: RemarkChannel.USER },
          { id: mockTeamUser.id, name: mockTeamUser.name, role: 'Management' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateRemark() and deleteRemark() - Cross-Action Protection & Roles', () => {
    it('rejects modification if remark belongs to a different action item', async () => {
      mockPrisma.comment.findUnique.mockResolvedValueOnce({
        id: 'comm-foreign',
        actionItemId: 'other-action-999',
        text: JSON.stringify({ channel: 'USER', text: 'Text' }),
        userId: mockTeamUser.id,
      });

      await expect(
        service.updateRemark(
          'action-123',
          'comm-foreign',
          { text: 'Updated text' },
          { id: mockTeamUser.id, role: 'Management' },
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows only CMD role to edit a CMD Remark', async () => {
      mockPrisma.comment.findUnique.mockResolvedValueOnce({
        id: 'comm-cmd',
        actionItemId: 'action-123',
        text: JSON.stringify({ channel: 'CMD', text: 'Original CMD directive' }),
        userId: mockCmdUser.id,
      });

      await expect(
        service.updateRemark(
          'action-123',
          'comm-cmd',
          { text: 'Tampered directive' },
          { id: mockTeamUser.id, role: 'Management' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows only CMD role to delete a CMD Remark', async () => {
      mockPrisma.comment.findUnique.mockResolvedValueOnce({
        id: 'comm-cmd',
        actionItemId: 'action-123',
        text: JSON.stringify({ channel: 'CMD', text: 'Original CMD directive' }),
        userId: mockCmdUser.id,
      });

      await expect(
        service.deleteRemark(
          'action-123',
          'comm-cmd',
          { id: mockAdminUser.id, role: 'Admin' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
