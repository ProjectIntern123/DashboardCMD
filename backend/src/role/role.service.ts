import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoleService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getPermissionsList() {
    return this.prisma.permission.findMany({
      orderBy: [
        { resource: 'asc' },
        { action: 'asc' },
      ],
    });
  }

  async create(dto: any) {
    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
      },
    });

    if (dto.permissionIds && dto.permissionIds.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: dto.permissionIds.map((pId: string) => ({
          roleId: role.id,
          permissionId: pId,
        })),
      });
    }

    return this.findOne(role.id);
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async update(id: string, dto: any) {
    await this.findOne(id); // Check existence

    // Update Role Name
    await this.prisma.role.update({
      where: { id },
      data: { name: dto.name },
    });

    // Delete old role permissions linkage
    await this.prisma.rolePermission.deleteMany({
      where: { roleId: id },
    });

    // Link new permissions
    if (dto.permissionIds && dto.permissionIds.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: dto.permissionIds.map((pId: string) => ({
          roleId: id,
          permissionId: pId,
        })),
      });
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id); // Check existence

    // Cascade constraints are set in prisma onDelete: Cascade
    return this.prisma.role.delete({
      where: { id },
    });
  }
}
