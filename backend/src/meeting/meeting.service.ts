import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeetingDto, UpdateMeetingDto } from './dto/meeting.dto';

@Injectable()
export class MeetingService {
  constructor(private prisma: PrismaService) {}

  async create(createMeetingDto: any, userId: string) {
    const { attachments, ...data } = createMeetingDto;
    return this.prisma.meeting.create({
      data: {
        name: data.name,
        cat: data.cat,
        status: data.status,
        agenda: data.agenda || null,
        attendees: data.attendees || null,
        date: data.date,
        time: data.time || null,
        venue: data.venue || null,
        recur: data.recur || null,
        notes: data.notes || null,
        notepad: data.notepad || null,
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

  async findAll(filters: { start?: string; end?: string; search?: string; cat?: string }) {
    const where: any = { deletedAt: null };

    if (filters.cat) {
      where.cat = filters.cat;
    }

    if (filters.start && filters.end) {
      where.date = {
        gte: filters.start,
        lte: filters.end,
      };
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { agenda: { contains: filters.search, mode: 'insensitive' } },
        { attendees: { contains: filters.search, mode: 'insensitive' } },
        { venue: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.meeting.findMany({
      where,
      include: {
        attachments: true,
      },
      orderBy: {
        date: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, deletedAt: null },
      include: {
        attachments: true,
        comments: {
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found or has been deleted');
    }

    return meeting;
  }

  async update(id: string, updateMeetingDto: any, userId: string, userName: string) {
    await this.findOne(id); // Check existence
    const { attachments, ...data } = updateMeetingDto;

    // Clean old attachments
    const existingAttIds = attachments?.map((a: any) => a.id).filter(Boolean) || [];
    await this.prisma.attachment.deleteMany({
      where: {
        meetingId: id,
        id: { notIn: existingAttIds },
      },
    });

    const newAttachments = attachments?.filter((a: any) => !a.id) || [];

    return this.prisma.meeting.update({
      where: { id },
      data: {
        name: data.name,
        cat: data.cat,
        status: data.status,
        agenda: data.agenda || null,
        attendees: data.attendees || null,
        date: data.date,
        time: data.time || null,
        venue: data.venue || null,
        recur: data.recur || null,
        notes: data.notes || null,
        notepad: data.notepad || null,
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

  async reschedule(id: string, date: string, userId: string, userName: string) {
    const meeting = await this.findOne(id);

    return this.prisma.meeting.update({
      where: { id },
      data: {
        date,
      },
    });
  }

  async updateStatus(id: string, status: string, userId: string, userName: string) {
    const meeting = await this.findOne(id);

    return this.prisma.meeting.update({
      where: { id },
      data: {
        status,
      },
    });
  }

  async updateNotepad(id: string, notes: string, userId: string, userName: string) {
    const meeting = await this.findOne(id);

    return this.prisma.meeting.update({
      where: { id },
      data: {
        notepad: notes,
        notepadTs: new Date(),
      },
    });
  }

  async remove(id: string, userId: string, userName: string) {
    await this.findOne(id); // Check existence

    return this.prisma.meeting.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userName,
      },
    });
  }
}
