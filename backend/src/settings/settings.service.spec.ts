import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SettingsService - Document & Attachment Settings Unit Tests', () => {
  let service: SettingsService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      systemSetting: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.key === 'max_attachment_size_mb') {
            return Promise.resolve(null);
          }
          return Promise.resolve(null);
        }),
        upsert: jest.fn().mockImplementation(({ where, update, create }) => {
          return Promise.resolve({
            id: 'mock-id',
            key: where.key,
            value: update.value,
          });
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  describe('getMaxAttachmentSizeMb()', () => {
    it('should return default 10 MB when setting is not present in database', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue(null);
      const limit = await service.getMaxAttachmentSizeMb();
      expect(limit).toBe(10);
    });

    it('should return configured value when a valid number (e.g. 25 MB, 100 MB, 1000 MB, 9999 MB) is stored', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        id: '1',
        key: 'max_attachment_size_mb',
        value: '100',
      });
      const limit = await service.getMaxAttachmentSizeMb();
      expect(limit).toBe(100);
    });

    it('should safely fallback to default 10 MB if database contains corrupted or non-numeric value', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        id: '1',
        key: 'max_attachment_size_mb',
        value: 'not-a-number',
      });
      const limit = await service.getMaxAttachmentSizeMb();
      expect(limit).toBe(10);
    });

    it('should safely fallback to default 10 MB if database value is <= 0 or > 9999', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        id: '1',
        key: 'max_attachment_size_mb',
        value: '10000',
      });
      const limit = await service.getMaxAttachmentSizeMb();
      expect(limit).toBe(10);
    });
  });

  describe('validateFileSize() - Multipart / Binary Uploads', () => {
    it('should allow files within the configured maximum attachment size', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        key: 'max_attachment_size_mb',
        value: '10',
      });

      const allowedSize = 5 * 1024 * 1024; // 5 MB
      await expect(service.validateFileSize(allowedSize, 'report.pdf')).resolves.not.toThrow();
    });

    it('should reject files exceeding the configured maximum attachment size', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        key: 'max_attachment_size_mb',
        value: '10',
      });

      const oversized = 15 * 1024 * 1024; // 15 MB
      await expect(service.validateFileSize(oversized, 'large_mis.csv')).rejects.toThrow(BadRequestException);
      await expect(service.validateFileSize(oversized, 'large_mis.csv')).rejects.toThrow(
        '"large_mis.csv" (15.0 MB) exceeds the configured maximum permitted file size of 10 MB',
      );
    });

    it('should reject files exceeding 50 MB infrastructure limit even if policy is 100 MB', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        key: 'max_attachment_size_mb',
        value: '100',
      });

      const hugeFile = 60 * 1024 * 1024; // 60 MB
      await expect(service.validateFileSize(hugeFile, 'massive_mis.csv')).rejects.toThrow(BadRequestException);
      await expect(service.validateFileSize(hugeFile, 'massive_mis.csv')).rejects.toThrow(
        'exceeds the server infrastructure limit of 50 MB',
      );
    });
  });

  describe('validateAttachmentSizes() - Base64 JSON Uploads', () => {
    it('should pass with empty or undefined attachments array', async () => {
      await expect(service.validateAttachmentSizes(undefined)).resolves.not.toThrow();
      await expect(service.validateAttachmentSizes([])).resolves.not.toThrow();
    });

    it('should allow valid attachments within configured limit and safe transport bounds', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        key: 'max_attachment_size_mb',
        value: '25',
      });

      const attachments = [
        { name: 'doc1.pdf', size: 5 * 1024 * 1024 },
        { name: 'doc2.png', size: 10 * 1024 * 1024 },
      ];
      await expect(service.validateAttachmentSizes(attachments)).resolves.not.toThrow();
    });

    it('should reject when an attachment exceeds the configured policy limit', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        key: 'max_attachment_size_mb',
        value: '10',
      });

      const attachments = [
        { name: 'valid.pdf', size: 2 * 1024 * 1024 },
        { name: 'huge_scan.pdf', size: 15 * 1024 * 1024 },
      ];
      await expect(service.validateAttachmentSizes(attachments)).rejects.toThrow(BadRequestException);
      await expect(service.validateAttachmentSizes(attachments)).rejects.toThrow(
        '"huge_scan.pdf" (15.0 MB) exceeds the configured maximum permitted attachment size of 10 MB',
      );
    });

    it('should reject attachments exceeding 35 MB raw ceiling for Base64 payloads even if policy is 500 MB', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        key: 'max_attachment_size_mb',
        value: '500',
      });

      const attachments = [
        { name: 'giant_archive.zip', size: 40 * 1024 * 1024 },
      ];
      await expect(service.validateAttachmentSizes(attachments)).rejects.toThrow(BadRequestException);
      await expect(service.validateAttachmentSizes(attachments)).rejects.toThrow(
        'exceeds the 35 MB raw file ceiling for Base64 JSON payloads',
      );
    });

    it('should accurately calculate size from base64 data string when size field is missing or zero', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        key: 'max_attachment_size_mb',
        value: '1',
      });

      // 1 MB = 1,048,576 bytes. 2 MB raw file in Base64 is ~2.67 MB characters
      const largeBase64 = 'data:application/pdf;base64,' + 'A'.repeat(Math.floor(2 * 1024 * 1024 * (4 / 3)));
      const attachments = [{ name: 'base64_doc.pdf', size: 0, data: largeBase64 }];

      await expect(service.validateAttachmentSizes(attachments)).rejects.toThrow(BadRequestException);
      await expect(service.validateAttachmentSizes(attachments)).rejects.toThrow('exceeds the configured maximum permitted attachment size');
    });

    it('should detect spoofed small size when base64 payload is actually oversized', async () => {
      mockPrisma.systemSetting.findUnique.mockResolvedValue({
        key: 'max_attachment_size_mb',
        value: '2',
      });

      // Client claims size is 100 bytes, but sends a 5 MB Base64 payload
      const largeBase64 = 'data:application/pdf;base64,' + 'A'.repeat(Math.floor(5 * 1024 * 1024 * (4 / 3)));
      const attachments = [{ name: 'spoofed_size.pdf', size: 100, data: largeBase64 }];

      await expect(service.validateAttachmentSizes(attachments)).rejects.toThrow(BadRequestException);
      await expect(service.validateAttachmentSizes(attachments)).rejects.toThrow('exceeds the configured maximum permitted attachment size of 2 MB');
    });
  });

  describe('updateAttachmentSizeLimit()', () => {
    it('should persist valid attachment size limit for 10 MB, 25 MB, 100 MB, 1000 MB, and 9999 MB', async () => {
      for (const limit of [10, 25, 100, 1000, 9999]) {
        const res = await service.updateAttachmentSizeLimit(limit);
        expect(res.success).toBe(true);
        expect(res.maxAttachmentSizeMb).toBe(limit);
        expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { key: 'max_attachment_size_mb' },
            update: expect.objectContaining({ value: String(limit) }),
          }),
        );
      }
    });

    it('should provide infrastructure advisory when limit exceeds 35 MB', async () => {
      const res = await service.updateAttachmentSizeLimit(100);
      expect(res.isInfrastructureExceeded).toBe(true);
      expect(res.message).toContain('35 MB raw');
    });

    it('should reject values below 1 MB', async () => {
      await expect(service.updateAttachmentSizeLimit(0)).rejects.toThrow(BadRequestException);
      await expect(service.updateAttachmentSizeLimit(-5)).rejects.toThrow(BadRequestException);
    });

    it('should reject values above 9999 MB', async () => {
      await expect(service.updateAttachmentSizeLimit(10000)).rejects.toThrow(BadRequestException);
      await expect(service.updateAttachmentSizeLimit(50000)).rejects.toThrow(BadRequestException);
    });

    it('should reject non-integers', async () => {
      await expect(service.updateAttachmentSizeLimit(12.5 as any)).rejects.toThrow(BadRequestException);
      await expect(service.updateAttachmentSizeLimit(NaN as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateSettings() with max_attachment_size_mb', () => {
    it('should validate and upsert max_attachment_size_mb in generic settings update up to 9999 MB', async () => {
      await service.updateSettings({ max_attachment_size_mb: '500' });
      expect(mockPrisma.systemSetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'max_attachment_size_mb' },
          update: expect.objectContaining({ value: '500' }),
        }),
      );
    });

    it('should reject invalid values in generic settings update', async () => {
      await expect(service.updateSettings({ max_attachment_size_mb: '0' })).rejects.toThrow(BadRequestException);
      await expect(service.updateSettings({ max_attachment_size_mb: '10000' })).rejects.toThrow(BadRequestException);
      await expect(service.updateSettings({ max_attachment_size_mb: 'abc' })).rejects.toThrow(BadRequestException);
      await expect(service.updateSettings({ max_attachment_size_mb: '' })).rejects.toThrow(BadRequestException);
    });
  });
});
