import { Test, TestingModule } from '@nestjs/testing';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SettingsMailer } from './settings.mailer';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('SettingsController - Upload Limit & Authorization Guardrails', () => {
  let controller: SettingsController;
  let settingsService: Partial<SettingsService>;
  let settingsMailer: Partial<SettingsMailer>;

  beforeEach(async () => {
    settingsService = {
      getMaxAttachmentSizeMb: jest.fn().mockResolvedValue(10),
      updateAttachmentSizeLimit: jest.fn().mockResolvedValue({
        success: true,
        maxAttachmentSizeMb: 25,
        message: 'Updated',
      }),
      getAllSettings: jest.fn().mockResolvedValue({ max_attachment_size_mb: '10' }),
      getPublicSettings: jest.fn().mockResolvedValue({ max_attachment_size_mb: '10' }),
      updateSettings: jest.fn().mockResolvedValue({ success: true }),
    };

    settingsMailer = {
      testConnection: jest.fn(),
      sendEmail: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        { provide: SettingsService, useValue: settingsService },
        { provide: SettingsMailer, useValue: settingsMailer },
      ],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);
  });

  describe('getAttachmentLimit()', () => {
    it('returns active policy limits, defaults, and infrastructure ceilings publicly', async () => {
      const res = await controller.getAttachmentLimit();
      expect(res.maxAttachmentSizeMb).toBe(10);
      expect(res.minMb).toBe(1);
      expect(res.maxMb).toBe(35);
      expect(res.defaultMb).toBe(10);
      expect(res.infrastructureLimitMb).toBe(50);
      expect(res.maxSafeInlineMb).toBe(35);
      expect(res.isInfrastructureExceeded).toBe(false);
    });
  });

  describe('updateAttachmentLimit() authorization and input validation', () => {
    it('allows Admin role to update attachment limit with valid integer', async () => {
      const res = await controller.updateAttachmentLimit({ maxAttachmentSizeMb: 25 }, 'Admin');
      expect(res.success).toBe(true);
      expect(settingsService.updateAttachmentSizeLimit).toHaveBeenCalledWith(25);
    });

    it('allows Admin to set lower boundary (1 MB) and upper boundary (35 MB)', async () => {
      await controller.updateAttachmentLimit({ maxAttachmentSizeMb: 1 }, 'Admin');
      expect(settingsService.updateAttachmentSizeLimit).toHaveBeenCalledWith(1);

      await controller.updateAttachmentLimit({ maxAttachmentSizeMb: 35 }, 'Admin');
      expect(settingsService.updateAttachmentSizeLimit).toHaveBeenCalledWith(35);
    });

    it('rejects non-admin roles (CMD, Management, PA, Viewer, Guest) with ForbiddenException', async () => {
      const forbiddenRoles = ['CMD', 'Management', 'PA', 'Viewer', 'Guest', 'User'];
      for (const role of forbiddenRoles) {
        await expect(
          controller.updateAttachmentLimit({ maxAttachmentSizeMb: 20 }, role),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('rejects invalid inputs (< 1, > 35, non-numeric, empty string) with BadRequestException', async () => {
      const invalidValues = [0, -10, 36, 50, 100, 10000, 'abc', '', null as any, undefined as any];
      for (const val of invalidValues) {
        await expect(
          controller.updateAttachmentLimit({ maxAttachmentSizeMb: val }, 'Admin'),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  describe('update() generic settings', () => {
    it('rejects non-admin callers with ForbiddenException', () => {
      expect(() => controller.update({ app_name: 'Hartek' }, 'CMD')).toThrow(
        ForbiddenException,
      );
    });
  });
});
