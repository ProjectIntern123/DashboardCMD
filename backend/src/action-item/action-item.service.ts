import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActionItemDto, UpdateActionItemDto } from './dto/action-item.dto';

@Injectable()
export class ActionItemService {
  constructor(private prisma: PrismaService) {}

  async create(createActionItemDto: any, userId: string) {
    const { attachments, ...data } = createActionItemDto;
    return this.prisma.actionItem.create({
      data: {
        meetingId: data.meetingId || null,
        meetingName: data.meetingName || null,
        meetingDate: data.meetingDate || null,
        meetingType: data.meetingType || null,
        item: data.item,
        own: data.own,
        dept: data.dept || null,
        pri: data.pri,
        due: data.due || null,
        st: data.st,
        cd: data.cd || null,
        rem: data.rem || null,
        recur: data.recur || null,
        dep: data.dep || null,
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

  async findAll(filters: { search?: string; pri?: string; st?: string; dept?: string }) {
    const where: any = { deletedAt: null };

    if (filters.pri) {
      where.pri = filters.pri;
    }

    if (filters.st) {
      where.st = filters.st;
    }

    if (filters.dept) {
      where.dept = filters.dept;
    }

    if (filters.search) {
      where.OR = [
        { item: { contains: filters.search, mode: 'insensitive' } },
        { own: { contains: filters.search, mode: 'insensitive' } },
        { dept: { contains: filters.search, mode: 'insensitive' } },
        { rem: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.actionItem.findMany({
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
    const actionItem = await this.prisma.actionItem.findFirst({
      where: { id, deletedAt: null },
      include: {
        attachments: true,
        comments: {
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!actionItem) {
      throw new NotFoundException('Action item not found or has been deleted');
    }

    // Parse JSON string field from database if stored as string
    if (actionItem.assignedTo && typeof actionItem.assignedTo === 'string') {
      try {
        actionItem.assignedTo = JSON.parse(actionItem.assignedTo);
      } catch (e) {}
    }

    return actionItem;
  }

  async update(id: string, updateActionItemDto: any, userId: string, userName: string) {
    await this.findOne(id); // Check existence
    const { attachments, ...data } = updateActionItemDto;

    // Clean old attachments
    const existingAttIds = attachments?.map((a: any) => a.id).filter(Boolean) || [];
    await this.prisma.attachment.deleteMany({
      where: {
        actionItemId: id,
        id: { notIn: existingAttIds },
      },
    });

    const newAttachments = attachments?.filter((a: any) => !a.id) || [];

    return this.prisma.actionItem.update({
      where: { id },
      data: {
        meetingId: data.meetingId || null,
        meetingName: data.meetingName || null,
        meetingDate: data.meetingDate || null,
        meetingType: data.meetingType || null,
        item: data.item,
        own: data.own,
        dept: data.dept || null,
        pri: data.pri,
        due: data.due || null,
        st: data.st,
        cd: data.cd || null,
        rem: data.rem || null,
        recur: data.recur || null,
        dep: data.dep || null,
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
    const item = await this.findOne(id);
    const cd = status === 'Done' || status === 'Closed' ? new Date().toISOString().split('T')[0] : null;

    return this.prisma.actionItem.update({
      where: { id },
      data: {
        st: status,
        cd,
      },
    });
  }

  async updatePriority(id: string, priority: string, userId: string, userName: string) {
    await this.findOne(id);

    return this.prisma.actionItem.update({
      where: { id },
      data: {
        pri: priority,
      },
    });
  }

  async remove(id: string, userId: string, userName: string) {
    await this.findOne(id); // Check existence

    return this.prisma.actionItem.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userName,
      },
    });
  }
}
