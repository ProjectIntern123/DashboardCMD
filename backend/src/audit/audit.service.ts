import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    userId?: string;
    userEmail?: string;
    userName?: string;
    action: string;
    detail?: string;
    ipAddress?: string;
    userAgent?: string;
    oldValues?: any;
    newValues?: any;
  }) {
    const browser = this.extractBrowser(params.userAgent || '');
    const device = this.extractDevice(params.userAgent || '');

    return this.prisma.auditLog.create({
      data: {
        userId: params.userId || null,
        userEmail: params.userEmail || null,
        userName: params.userName || null,
        action: params.action,
        detail: params.detail || null,
        ipAddress: params.ipAddress || null,
        browser,
        device,
        oldValues: params.oldValues || null,
        newValues: params.newValues || null,
      },
    });
  }

  async findAll(filters: { search?: string; userId?: string; limit?: number; offset?: number }) {
    const where: any = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.search) {
      where.OR = [
        { action: { contains: filters.search, mode: 'insensitive' } },
        { userName: { contains: filters.search, mode: 'insensitive' } },
        { userEmail: { contains: filters.search, mode: 'insensitive' } },
        { detail: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: {
          timestamp: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      total,
      limit,
      offset,
    };
  }

  private extractBrowser(ua: string): string {
    if (!ua) return 'Unknown';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Chrome') && !ua.includes('Chromium')) return 'Chrome';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Browser';
  }

  private extractDevice(ua: string): string {
    if (!ua) return 'Unknown';
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('Android')) return 'Android Mobile';
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Macintosh')) return 'Macbook/Mac';
    if (ua.includes('Linux')) return 'Linux Station';
    return 'Workstation';
  }
}
