import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFollowUpDto, UpdateFollowUpDto } from './dto/follow-up.dto';

@Injectable()
export class FollowUpService {
  constructor(private prisma: PrismaService) {}

  async create(createFollowUpDto: any, userId: string) {
    const { attachments, ...data } = createFollowUpDto;
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

    return this.prisma.followUp.update({
      where: { id },
      data: {
        priority: data.priority,
        bu: data.bu || null,
        hd: data.hd || null,
        proj: data.proj,
        with: data.with || null,
        dl: data.dl || null,
        desc: data.desc || null,
        st: data.st,
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
