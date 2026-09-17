import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

@Injectable()
export class ProjectService {
  constructor(private prisma: PrismaService) {}

  async findAllDepartments() {
    return this.prisma.department.findMany({
      where: { name: { not: 'CMD Office' } }, // Exclude CMD Office from project department choices if desired, or return all
      orderBy: { name: 'asc' },
    });
  }

  async create(createProjectDto: any, userId: string) {
    const { attachments, ...data } = createProjectDto;
    return this.prisma.project.create({
      data: {
        name: data.name,
        buId: data.buId || null,
        client: data.client,
        location: data.location,
        pm: data.pm,
        stage: data.stage,
        health: data.health,
        order: data.order || null,
        odate: data.odate ? new Date(data.odate) : null,
        cod: data.cod ? new Date(data.cod) : null,
        rcod: data.rcod ? new Date(data.rcod) : null,
        prog: data.prog || 0,
        billed: data.billed || null,
        collected: data.collected || null,
        milestone: data.milestone,
        mdate: data.mdate ? new Date(data.mdate) : null,
        risks: data.risks,
        rem: data.rem,
        attachments: {
          create:
            attachments?.map((att: any) => ({
              name: att.name,
              type: att.type,
              size: att.size,
              data: att.data,
            })) || [],
        },
      },
      include: {
        businessUnit: true,
        attachments: true,
      },
    });
  }

  async findAll(filters: {
    search?: string;
    buId?: string;
    stage?: string;
    health?: string;
  }) {
    const where: any = { deletedAt: null };

    if (filters.buId) {
      where.buId = filters.buId;
    }

    if (filters.stage) {
      where.stage = filters.stage;
    }

    if (filters.health) {
      where.health = filters.health;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { client: { contains: filters.search, mode: 'insensitive' } },
        { location: { contains: filters.search, mode: 'insensitive' } },
        { pm: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const projects = await this.prisma.project.findMany({
      where,
      include: {
        businessUnit: true,
        attachments: true,
      },
    });

    return projects.sort((a, b) => {
      const orderMap: Record<string, number> = { Red: 1, Amber: 2, Green: 3 };
      const valA = orderMap[a.health] || 4;
      const valB = orderMap[b.health] || 4;
      if (valA !== valB) return valA - valB;
      return (a.name || '').localeCompare(b.name || '');
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        businessUnit: true,
        attachments: true,
        comments: {
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found or has been deleted');
    }

    return project;
  }

  async update(
    id: string,
    updateProjectDto: any,
    userId: string,
    userName: string,
  ) {
    await this.findOne(id); // Check existence
    const { attachments, ...data } = updateProjectDto;

    // Clean old attachments
    const existingAttIds =
      attachments?.map((a: any) => a.id).filter(Boolean) || [];
    await this.prisma.attachment.deleteMany({
      where: {
        projectId: id,
        id: { notIn: existingAttIds },
      },
    });

    const newAttachments = attachments?.filter((a: any) => !a.id) || [];

    return this.prisma.project.update({
      where: { id },
      data: {
        name: data.name,
        buId: data.buId || null,
        client: data.client,
        location: data.location,
        pm: data.pm,
        stage: data.stage,
        health: data.health,
        order: data.order || null,
        odate: data.odate ? new Date(data.odate) : null,
        cod: data.cod ? new Date(data.cod) : null,
        rcod: data.rcod ? new Date(data.rcod) : null,
        prog: data.prog || 0,
        billed: data.billed || null,
        collected: data.collected || null,
        milestone: data.milestone,
        mdate: data.mdate ? new Date(data.mdate) : null,
        risks: data.risks,
        rem: data.rem,
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
        businessUnit: true,
        attachments: true,
      },
    });
  }

  async remove(id: string, userId: string, userName: string) {
    await this.findOne(id); // Check existence

    return this.prisma.project.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userName,
      },
    });
  }
}
