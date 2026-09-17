import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEscalationDto, UpdateEscalationDto } from './dto/escalation.dto';

@Injectable()
export class EscalationService {
  constructor(private prisma: PrismaService) {}

  async create(createEscalationDto: any, userId: string) {
    const { attachments, ...data } = createEscalationDto;
    const totalCount = await this.prisma.escalation.count();
    const code = data.code || `ESC-2026-${String(totalCount + 1).padStart(2, '0')}`;

    return this.prisma.escalation.create({
      data: {
        code,
        proj: data.proj,
        type: createActionItemType(data.type),
        sev: data.sev,
        desc: data.desc || null,
        by: data.by || null,
        date: data.date || new Date().toISOString().split('T')[0],
        own: data.own || null,
        esc: data.esc || null,
        tgt: data.tgt || null,
        st: data.st,
        res: data.res || null,
        assignedTo: (data.assignedTo as any) || null,
        attachments: {
          create: attachments?.map((att: any) => ({
            name: att.name,
            type: att.type,
            size: att.size,
            data: att.data,
          })) || [],
        },
      },
      include: {
        attachments: true,
      },
    });
  }

  async findAll(filters: { search?: string; sev?: string; st?: string }) {
    const where: any = { deletedAt: null };

    if (filters.sev) {
      where.sev = filters.sev;
    }

    if (filters.st) {
      where.st = filters.st;
    }

    if (filters.search) {
      where.OR = [
        { proj: { contains: filters.search, mode: 'insensitive' } },
        { type: { contains: filters.search, mode: 'insensitive' } },
        { desc: { contains: filters.search, mode: 'insensitive' } },
        { by: { contains: filters.search, mode: 'insensitive' } },
        { own: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.escalation.findMany({
      where,
      include: {
        attachments: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const escalation = await this.prisma.escalation.findFirst({
      where: { id, deletedAt: null },
      include: {
        attachments: true,
        comments: {
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!escalation) {
      throw new NotFoundException('Escalation not found or has been deleted');
    }

    if (escalation.assignedTo && typeof escalation.assignedTo === 'string') {
      try {
        escalation.assignedTo = JSON.parse(escalation.assignedTo);
      } catch (e) {}
    }

    return escalation;
  }

  async update(id: string, updateEscalationDto: any, userId: string, userName: string) {
    await this.findOne(id); // Check existence
    const { attachments, ...data } = updateEscalationDto;

    // Clean old attachments
    const existingAttIds = attachments?.map((a: any) => a.id).filter(Boolean) || [];
    await this.prisma.attachment.deleteMany({
      where: {
        escalationId: id,
        id: { notIn: existingAttIds },
      },
    });

    const newAttachments = attachments?.filter((a: any) => !a.id) || [];

    return this.prisma.escalation.update({
      where: { id },
      data: {
        code: data.code,
        proj: data.proj,
        type: data.type,
        sev: data.sev,
        desc: data.desc || null,
        by: data.by || null,
        date: data.date || null,
        own: data.own || null,
        esc: data.esc || null,
        tgt: data.tgt || null,
        st: data.st,
        res: data.res || null,
        assignedTo: (data.assignedTo as any) || null,
        attachments: {
          create: newAttachments.map((att: any) => ({
            name: att.name,
            type: att.type,
            size: att.size,
            data: att.data,
          })),
        },
      },
      include: {
        attachments: true,
      },
    });
  }

  async updateStatus(id: string, status: string, userId: string, userName: string) {
    await this.findOne(id);

    return this.prisma.escalation.update({
      where: { id },
      data: {
        st: status,
      },
    });
  }

  async remove(id: string, userId: string, userName: string) {
    await this.findOne(id); // Check existence

    return this.prisma.escalation.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userName,
      },
    });
  }
}

function createActionItemType(type: string): string {
  const allowed = ['Technical', 'Commercial', 'Regulatory', 'Resources', 'Other'];
  return allowed.includes(type) ? type : 'Technical';
}
