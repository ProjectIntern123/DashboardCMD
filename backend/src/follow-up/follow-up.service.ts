import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { RecipientValidator } from '../common/utils/recipient-validator';
import { CreateFollowUpDto, UpdateFollowUpDto } from './dto/follow-up.dto';

@Injectable()
export class FollowUpService {
  constructor(
    private prisma: PrismaService,
    private settingsService: SettingsService,
    private recipientValidator: RecipientValidator,
  ) {}

  async create(createFollowUpDto: any, userId: string) {
    const { attachments, ...data } = createFollowUpDto;

    if (attachments && attachments.length > 0) {
      await this.settingsService.validateAttachmentSizes(attachments);
    }

    let validatedAssignedTo = null;
    if (data.assignedTo !== undefined && data.assignedTo !== null) {
      validatedAssignedTo = await this.recipientValidator.validateMixedRecipients(data.assignedTo);
    }

    return this.prisma.followUp.create({
      data: {
        priority: data.priority,
        bu: data.bu || null,
        hd: data.hd || null,
        proj: data.proj,
        with: data.with || null,
        dl: data.dl || null,
        desc: data.desc || null,
        st: data.st,
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
  }

  async findAll(filters: { search?: string; priority?: string; st?: string; bu?: string }) {
    const where: any = { deletedAt: null };

    if (filters.priority) {
      where.priority = filters.priority;
    }

    if (filters.st) {
      where.st = filters.st;
    }

    if (filters.bu) {
      where.bu = filters.bu;
    }

    if (filters.search) {
      where.OR = [
        { proj: { contains: filters.search, mode: 'insensitive' } },
        { bu: { contains: filters.search, mode: 'insensitive' } },
        { with: { contains: filters.search, mode: 'insensitive' } },
        { desc: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.followUp.findMany({
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
    const followUp = await this.prisma.followUp.findFirst({
      where: { id, deletedAt: null },
      include: {
        attachments: true,
        comments: {
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!followUp) {
      throw new NotFoundException('Follow up not found or has been deleted');
    }

    if (followUp.assignedTo && typeof followUp.assignedTo === 'string') {
      try {
        followUp.assignedTo = JSON.parse(followUp.assignedTo);
      } catch (e) {}
    }

    return followUp;
  }

  async update(id: string, updateFollowUpDto: any, userId: string, userName: string) {
    await this.findOne(id); // Check existence
    const { attachments, ...data } = updateFollowUpDto;

    // Clean old attachments
    const existingAttIds = attachments?.map((a: any) => a.id).filter(Boolean) || [];
    await this.prisma.attachment.deleteMany({
      where: {
        followUpId: id,
        id: { notIn: existingAttIds },
      },
    });

    const newAttachments = attachments?.filter((a: any) => !a.id) || [];
    if (newAttachments.length > 0) {
      await this.settingsService.validateAttachmentSizes(newAttachments);
    }

    const updateData: any = {
      priority: data.priority,
      bu: data.bu !== undefined ? data.bu || null : undefined,
      hd: data.hd !== undefined ? data.hd || null : undefined,
      proj: data.proj,
      with: data.with !== undefined ? data.with || null : undefined,
      dl: data.dl !== undefined ? data.dl || null : undefined,
      desc: data.desc !== undefined ? data.desc || null : undefined,
      st: data.st,
    };

    if (data.assignedTo !== undefined) {
      updateData.assignedTo = data.assignedTo === null
        ? null
        : (await this.recipientValidator.validateMixedRecipients(data.assignedTo) as any);
    }

    return this.prisma.followUp.update({
      where: { id },
      data: {
        ...updateData,
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

    return this.prisma.followUp.update({
      where: { id },
      data: {
        st: status,
      },
    });
  }

  async remove(id: string, userId: string, userName: string) {
    await this.findOne(id); // Check existence

    return this.prisma.followUp.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userName,
      },
    });
  }
}
