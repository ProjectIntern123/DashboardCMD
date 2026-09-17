import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { RoleService } from './role.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  findAll(@GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can access roles configuration');
    }
    return this.roleService.findAll();
  }

  @Get('permissions')
  getPermissions(@GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can query permissions list');
    }
    return this.roleService.getPermissionsList();
  }

  @Post()
  create(@Body() dto: any, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can create custom roles');
    }
    return this.roleService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: any, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can update roles');
    }
    return this.roleService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can delete roles');
    }
    return this.roleService.remove(id);
  }
}
