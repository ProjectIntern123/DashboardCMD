import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { RecipientValidator } from '../common/utils/recipient-validator';
import {
  CreateActionItemDto,
  UpdateActionItemDto,
  CreateActionRemarkDto,
  UpdateActionRemarkDto,
  RemarkChannel,
} from './dto/action-item.dto';

@Injectable()
export class ActionItemService {
  constructor(
    private prisma: PrismaService,
    private settingsService: SettingsService,
    private recipientValidator: RecipientValidator,
  ) {}

  async create(createActionItemDto: any, userId: string) {
    const { attachments, ...data } = createActionItemDto;

    if (attachments && attachments.length > 0) {
      await this.settingsService.validateAttachmentSizes(attachments);
    }

    let validatedAssignedTo = null;
    if (data.assignedTo) {
      validatedAssignedTo = await this.recipientValidator.validateMixedRecipients(data.assignedTo);
    }

    const created = await this.prisma.actionItem.create({
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
        assignedTo: (validatedAssignedTo as any) || null,
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

    let creator = null;
    if (userId) {
      try {
        const u = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true },
        });
        if (u) {
          creator = {
            id: u.id,
            name: u.name,
            email: u.email,
          };
        }
      } catch (e) {}
    }

    return {
      ...created,
      creator,
    };
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

    const items = await this.prisma.actionItem.findMany({
      where,
      include: {
        attachments: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (items.length === 0) {
      return [];
    }

    const itemIds = items.map((item) => item.id);
    const creatorMap = new Map<string, { id: string; name: string; email?: string }>();

    try {
      const orConditions = itemIds.map((id) => ({
        newValues: {
          path: ['id'],
          equals: id,
        },
      }));

      const creationLogs = await this.prisma.auditLog.findMany({
        where: {
          action: 'Created Action Item',
          userId: { not: null },
          OR: orConditions,
        },
        select: {
          userId: true,
          userName: true,
          userEmail: true,
          newValues: true,
        },
      });

      for (const log of creationLogs) {
        const newVals = log.newValues as any;
        if (newVals && newVals.id && log.userId && log.userName && itemIds.includes(newVals.id)) {
          creatorMap.set(newVals.id, {
            id: log.userId,
            name: log.userName,
            email: log.userEmail || undefined,
          });
        }
      }
    } catch (e) {
      // Fail closed to legacy fallback
    }

    return items.map((item) => ({
      ...item,
      creator: creatorMap.get(item.id) || null,
    }));
  }

  async findOne(id: string) {
    const actionItem = await this.prisma.actionItem.findFirst({
      where: { id, deletedAt: null },
      include: {
        attachments: true,
        comments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                initials: true,
                role: { select: { name: true } },
              },
            },
          },
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

    // Normalize comments so external callers receive clean text and channel rather than raw internal JSON
    const normalizedComments = (actionItem.comments || []).map((c: any) => {
      let text = c.text;
      let channel = RemarkChannel.USER;
      try {
        if (c.text && typeof c.text === 'string' && c.text.startsWith('{') && c.text.endsWith('}')) {
          const payload = JSON.parse(c.text);
          if (payload.text !== undefined) {
            text = payload.text;
            if (payload.channel && String(payload.channel).toUpperCase() === 'CMD') {
              channel = RemarkChannel.CMD;
            }
          }
        }
      } catch (e) {
        // Plain text fallback
      }

      return {
        id: c.id,
        text,
        channel,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        userId: c.userId,
        user: c.user,
      };
    });

    // Resolve creator from AuditLog scoped to this specific action item
    let creator = null;
    try {
      const creationLog = await this.prisma.auditLog.findFirst({
        where: {
          action: 'Created Action Item',
          userId: { not: null },
          newValues: {
            path: ['id'],
            equals: id,
          },
        },
        select: {
          userId: true,
          userName: true,
          userEmail: true,
          newValues: true,
        },
      });

      if (creationLog && creationLog.userId && creationLog.userName) {
        const nv = creationLog.newValues as any;
        if (nv && nv.id === id) {
          creator = {
            id: creationLog.userId,
            name: creationLog.userName,
            email: creationLog.userEmail || undefined,
          };
        }
      }
    } catch (e) {}

    return {
      ...actionItem,
      comments: normalizedComments,
      creator,
    };
  }

  async update(id: string, updateActionItemDto: any, userId: string, userName: string) {
    const existingAction = await this.findOne(id); // Check existence
    const { attachments, ...data } = updateActionItemDto;

    if (data.assignedTo !== undefined) {
      await this.recipientValidator.validateMixedRecipients(data.assignedTo);
    }

    // Clean old attachments
    const existingAttIds = attachments?.map((a: any) => a.id).filter(Boolean) || [];
    await this.prisma.attachment.deleteMany({
      where: {
        actionItemId: id,
        id: { notIn: existingAttIds },
      },
    });

    const newAttachments = attachments?.filter((a: any) => !a.id) || [];
    if (newAttachments.length > 0) {
      await this.settingsService.validateAttachmentSizes(newAttachments);
    }

    let validatedAssignedTo = existingAction.assignedTo;
    if (data.assignedTo !== undefined) {
      validatedAssignedTo = data.assignedTo === null
        ? null
        : (await this.recipientValidator.validateMixedRecipients(data.assignedTo) as any);
    }

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
        assignedTo: (validatedAssignedTo as any),
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

  async getRemarks(actionItemId: string) {
    const action = await this.findOne(actionItemId);

    const comments = await this.prisma.comment.findMany({
      where: { actionItemId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            initials: true,
            role: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const userRemarks: any[] = [];
    const cmdRemarks: any[] = [];

    for (const c of comments) {
      let parsedText = c.text;
      let channel = RemarkChannel.USER;
      try {
        if (c.text.startsWith('{') && c.text.endsWith('}')) {
          const payload = JSON.parse(c.text);
          if (payload.channel && payload.text) {
            channel = payload.channel.toUpperCase() === 'CMD' ? RemarkChannel.CMD : RemarkChannel.USER;
            parsedText = payload.text;
          }
        }
      } catch (e) {
        // Plain text fallback
      }

      const remarkObj = {
        id: c.id,
        actionItemId,
        text: parsedText,
        channel,
        createdAt: c.createdAt,
        author: c.user
          ? {
              id: c.user.id,
              name: c.user.name,
              email: c.user.email,
              initials: c.user.initials,
              role: c.user.role?.name || 'User',
            }
          : {
              id: null,
              name: 'Legacy record',
              role: 'Unknown',
            },
      };

      if (channel === RemarkChannel.CMD) {
        cmdRemarks.push(remarkObj);
      } else {
        userRemarks.push(remarkObj);
      }
    }

    return {
      actionItemId,
      legacyRemark: action.rem || null,
      userRemarks,
      cmdRemarks,
    };
  }

  async createRemark(
    actionItemId: string,
    dto: CreateActionRemarkDto,
    user: { id: string; name: string; role: string },
  ) {
    await this.findOne(actionItemId);

    const rawChannel = (dto.channel || RemarkChannel.USER).toUpperCase();
    const channel = rawChannel === 'CMD' ? RemarkChannel.CMD : RemarkChannel.USER;

    if (channel === RemarkChannel.CMD && user.role !== 'CMD') {
      throw new ForbiddenException('Only users with the canonical CMD role can create CMD remarks');
    }

    const text = (dto.text || '').trim();
    if (!text) {
      throw new BadRequestException('Remark text cannot be empty');
    }
    if (text.length > 2000) {
      throw new BadRequestException('Remark text cannot exceed 2000 characters');
    }

    const envelope = JSON.stringify({
      channel,
      text,
    });

    const comment = await this.prisma.comment.create({
      data: {
        text: envelope,
        actionItemId,
        userId: user.id,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            initials: true,
            role: { select: { name: true } },
          },
        },
      },
    });

    return {
      id: comment.id,
      actionItemId,
      text,
      channel,
      createdAt: comment.createdAt,
      author: comment.user
        ? {
            id: comment.user.id,
            name: comment.user.name,
            email: comment.user.email,
            initials: comment.user.initials,
            role: comment.user.role?.name || user.role,
          }
        : {
            id: user.id,
            name: user.name,
            role: user.role,
          },
    };
  }

  async updateRemark(
    actionItemId: string,
    remarkId: string,
    dto: UpdateActionRemarkDto,
    user: { id: string; role: string },
  ) {
    await this.findOne(actionItemId);

    const comment = await this.prisma.comment.findUnique({
      where: { id: remarkId },
      include: { user: { include: { role: true } } },
    });

    if (!comment || comment.actionItemId !== actionItemId) {
      throw new NotFoundException('Remark not found or does not belong to this action item');
    }

    let channel = RemarkChannel.USER;
    try {
      if (comment.text.startsWith('{') && comment.text.endsWith('}')) {
        const p = JSON.parse(comment.text);
        if (p.channel && p.channel.toUpperCase() === 'CMD') {
          channel = RemarkChannel.CMD;
        }
      }
    } catch (e) {}

    if (channel === RemarkChannel.CMD && user.role !== 'CMD') {
      throw new ForbiddenException('Only users with the canonical CMD role can edit CMD remarks');
    }

    if (channel === RemarkChannel.USER && user.role !== 'CMD' && comment.userId !== user.id) {
      throw new ForbiddenException('You can only edit your own user remarks');
    }

    const text = (dto.text || '').trim();
    if (!text) {
      throw new BadRequestException('Remark text cannot be empty');
    }
    if (text.length > 2000) {
      throw new BadRequestException('Remark text cannot exceed 2000 characters');
    }

    const updated = await this.prisma.comment.update({
      where: { id: remarkId },
      data: {
        text: JSON.stringify({ channel, text }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            initials: true,
            role: { select: { name: true } },
          },
        },
      },
    });

    return {
      id: updated.id,
      actionItemId,
      text,
      channel,
      createdAt: updated.createdAt,
      author: updated.user
        ? {
            id: updated.user.id,
            name: updated.user.name,
            email: updated.user.email,
            initials: updated.user.initials,
            role: updated.user.role?.name || user.role,
          }
        : null,
    };
  }

  async deleteRemark(
    actionItemId: string,
    remarkId: string,
    user: { id: string; role: string },
  ) {
    await this.findOne(actionItemId);

    const comment = await this.prisma.comment.findUnique({
      where: { id: remarkId },
      include: { user: { include: { role: true } } },
    });

    if (!comment || comment.actionItemId !== actionItemId) {
      throw new NotFoundException('Remark not found or does not belong to this action item');
    }

    let channel = RemarkChannel.USER;
    try {
      if (comment.text.startsWith('{') && comment.text.endsWith('}')) {
        const p = JSON.parse(comment.text);
        if (p.channel && p.channel.toUpperCase() === 'CMD') {
          channel = RemarkChannel.CMD;
        }
      }
    } catch (e) {}

    if (channel === RemarkChannel.CMD && user.role !== 'CMD') {
      throw new ForbiddenException('Only users with the canonical CMD role can delete CMD remarks');
    }

    if (channel === RemarkChannel.USER && user.role !== 'CMD' && comment.userId !== user.id) {
      throw new ForbiddenException('You can only delete your own user remarks');
    }

    await this.prisma.comment.delete({
      where: { id: remarkId },
    });

    return { success: true, message: 'Remark deleted successfully' };
  }
}
