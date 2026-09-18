import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto, UpdateTaskProgressDto } from './dto/task.dto';

@Injectable()
export class TaskService {
  constructor(private prisma: PrismaService) {}

  async create(createTaskDto: any, userId: string, roleName: string) {
    const { attachments, ...data } = createTaskDto;
    const batchId = Math.random().toString(36).substring(2, 10);
    const createdTasks = [];

    const isSystemAdmin = roleName === 'Admin' || roleName === 'CMD';
    for (const assigneeId of data.assigneeIds) {
      if (!isSystemAdmin) {
        const assigneeUser = await this.prisma.user.findUnique({
          where: { id: assigneeId },
        });
        if (!assigneeUser || assigneeUser.managerId !== userId) {
          throw new ForbiddenException('You can only assign tasks to employees who report directly to you.');
        }
      }
    }

    for (const assigneeId of data.assigneeIds) {
      const task = await this.prisma.task.create({
        data: {
          batchId,
          title: data.title,
          detail: data.detail || null,
          assigneeId,
          assignedById: userId,
          pri: data.pri,
          due: data.due || null,
          st: data.st,
          cd: data.cd || null,
          note: data.note || null,
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
      createdTasks.push(task);
    }

    return createdTasks;
  }

  async findAll(userId: string, roleName: string, filters: { search?: string; pri?: string; st?: string; assigneeId?: string }) {
    const where: any = { deletedAt: null };

    // Enforce access boundary: see tasks assigned to you, created by you, OR assigned to employees who report to you
    const isSystemAdminOrViewer = roleName === 'Admin' || roleName === 'CMD' || roleName === 'Viewer';
    if (!isSystemAdminOrViewer) {
      where.OR = [
        { assigneeId: userId },
        { assignedById: userId },
        { assignee: { managerId: userId } }
      ];
    }

    if (filters.assigneeId) {
      where.assigneeId = filters.assigneeId;
    }

    if (filters.pri) {
      where.pri = filters.pri;
    }

    if (filters.st) {
      where.st = filters.st;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { detail: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.task.findMany({
      where,
      include: {
        assignee: true,
        assignedBy: true,
        attachments: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, userId: string, roleName: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignee: true,
        assignedBy: true,
        attachments: true,
        comments: {
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found or has been deleted');
    }

    // Role-based visibility check (exempt Super Admin, Admin, and Viewer roles)
    const isSystemAdminOrViewer = roleName === 'Admin' || roleName === 'Viewer';
    if (!isSystemAdminOrViewer && task.assigneeId !== userId && task.assignedById !== userId) {
      throw new ForbiddenException('You do not have access to view this task');
    }

    return task;
  }

  async update(id: string, updateTaskDto: any, userId: string, roleName: string, userName?: string) {
    const task = await this.findOne(id, userId, roleName); // Check existence
    const { attachments, ...data } = updateTaskDto;

    // Only the assigner (CMD) or the task creator can modify core task details
    const isSystemAdmin = roleName === 'Admin';
    if (!isSystemAdmin && task.assignedById !== userId) {
      throw new ForbiddenException('Only the task assigner can edit task assignments');
    }

    // Clean old attachments
    const existingAttIds = attachments?.map((a: any) => a.id).filter(Boolean) || [];
    await this.prisma.attachment.deleteMany({
      where: {
        taskId: id,
        id: { notIn: existingAttIds },
      },
    });

    const newAttachments = attachments?.filter((a: any) => !a.id) || [];

    return this.prisma.task.update({
      where: { id },
      data: {
        title: data.title,
        detail: data.detail || null,
        pri: data.pri,
        due: data.due || null,
        st: data.st,
        cd: data.cd || null,
        note: data.note || null,
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

  async updateProgress(id: string, updateProgressDto: UpdateTaskProgressDto, userId: string, roleName: string, userName: string) {
    const task = await this.findOne(id, userId, roleName);

    // The assignee (or assigner) updates status, completion date, and logs notes
    if (roleName !== 'Admin' && task.assigneeId !== userId) {
      throw new ForbiddenException('You can only update your own assigned tasks');
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        note: updateProgressDto.note !== undefined ? updateProgressDto.note : task.note,
        cd: updateProgressDto.cd !== undefined ? updateProgressDto.cd : task.cd,
      },
    });
  }

  async updateStatus(id: string, status: string, userId: string, roleName: string) {
    const task = await this.findOne(id, userId, roleName);

    if (roleName !== 'Admin' && task.assigneeId !== userId) {
      throw new ForbiddenException('You can only update your own assigned tasks');
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        st: status,
        cd: status === 'Done' ? new Date().toISOString().split('T')[0] : null,
      },
    });
  }

  async remove(id: string, userId: string, roleName: string, userName: string) {
    const task = await this.findOne(id, userId, roleName);

    const isSystemAdmin = roleName === 'Admin';
    if (!isSystemAdmin && task.assignedById !== userId) {
      throw new ForbiddenException('Only the task assigner can delete tasks');
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userName,
      },
    });
  }
}
