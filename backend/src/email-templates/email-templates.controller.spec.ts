import { Test, TestingModule } from '@nestjs/testing';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';
import { ForbiddenException } from '@nestjs/common';

describe('EmailTemplatesController (Unit / Offline)', () => {
  let controller: EmailTemplatesController;
  let service: EmailTemplatesService;

  const mockService = {
    syncDefaultTemplates: jest.fn().mockResolvedValue({
      success: true,
      createdCount: 2,
      createdKeys: ['PASSWORD_RESET', 'MFA_OTP'],
    }),
    findAll: jest.fn().mockResolvedValue([
      { id: 't-1', name: 'Password Reset', eventKey: 'PASSWORD_RESET' },
    ]),
    findOne: jest.fn().mockResolvedValue({ id: 't-1', name: 'Password Reset' }),
    create: jest.fn().mockResolvedValue({ id: 't-new', name: 'New Template' }),
    update: jest.fn().mockResolvedValue({ id: 't-1', name: 'Updated Template' }),
    toggleActive: jest.fn().mockResolvedValue({ id: 't-1', isActive: false }),
    remove: jest.fn().mockResolvedValue({ id: 't-1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailTemplatesController],
      providers: [
        {
          provide: EmailTemplatesService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<EmailTemplatesController>(EmailTemplatesController);
    service = module.get<EmailTemplatesService>(EmailTemplatesService);
    jest.clearAllMocks();
  });

  describe('POST /email-templates/sync-defaults Role Authorization', () => {
    it('allows authorized "Admin" role to trigger sync-defaults', async () => {
      const res = await controller.syncDefaults('Admin');

      expect(res).toEqual({
        success: true,
        createdCount: 2,
        createdKeys: ['PASSWORD_RESET', 'MFA_OTP'],
      });
      expect(mockService.syncDefaultTemplates).toHaveBeenCalledTimes(1);
    });

    it('rejects "CMD" business role with ForbiddenException', () => {
      expect(() => controller.syncDefaults('CMD')).toThrow(ForbiddenException);
      expect(mockService.syncDefaultTemplates).not.toHaveBeenCalled();
    });

    it('rejects "Manager" role with ForbiddenException', () => {
      expect(() => controller.syncDefaults('Manager')).toThrow(ForbiddenException);
      expect(mockService.syncDefaultTemplates).not.toHaveBeenCalled();
    });

    it('rejects "Supervisor" role with ForbiddenException', () => {
      expect(() => controller.syncDefaults('Supervisor')).toThrow(ForbiddenException);
      expect(mockService.syncDefaultTemplates).not.toHaveBeenCalled();
    });

    it('rejects "Employee" role with ForbiddenException', () => {
      expect(() => controller.syncDefaults('Employee')).toThrow(ForbiddenException);
      expect(mockService.syncDefaultTemplates).not.toHaveBeenCalled();
    });

    it('rejects "Viewer" role with ForbiddenException', () => {
      expect(() => controller.syncDefaults('Viewer')).toThrow(ForbiddenException);
      expect(mockService.syncDefaultTemplates).not.toHaveBeenCalled();
    });

    it('rejects empty, null or undefined role with ForbiddenException', () => {
      expect(() => controller.syncDefaults('')).toThrow(ForbiddenException);
      expect(() => controller.syncDefaults(null as any)).toThrow(ForbiddenException);
      expect(() => controller.syncDefaults(undefined as any)).toThrow(ForbiddenException);
      expect(mockService.syncDefaultTemplates).not.toHaveBeenCalled();
    });
  });

  describe('Standard Controller Endpoints Role Authorization', () => {
    it('allows Admin to query template list', async () => {
      const res = await controller.findAll('Admin');
      expect(res).toHaveLength(1);
      expect(mockService.findAll).toHaveBeenCalledTimes(1);
    });

    it('denies non-Admin roles from reading template list', () => {
      expect(() => controller.findAll('CMD')).toThrow(ForbiddenException);
      expect(() => controller.findAll('Manager')).toThrow(ForbiddenException);
      expect(mockService.findAll).not.toHaveBeenCalled();
    });

    it('allows Admin to query system events list', () => {
      const events = controller.getSystemEvents('Admin');
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });

    it('denies non-Admin roles from querying system events list', () => {
      expect(() => controller.getSystemEvents('CMD')).toThrow(ForbiddenException);
      expect(() => controller.getSystemEvents('Employee')).toThrow(ForbiddenException);
    });
  });
});
