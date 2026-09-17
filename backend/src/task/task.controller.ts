import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { TaskService } from './task.service';
import { CreateTaskDto, UpdateTaskDto, UpdateTaskProgressDto } from './dto/task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('tasks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  @RequirePermissions('Create:Tasks')
  create(
    @Body() createTaskDto: CreateTaskDto,
    @GetUser('id') userId: string,
    @GetUser('role') roleName: string,
  ) {
    return this.taskService.create(createTaskDto, userId, roleName);
  }

  @Get()
  @RequirePermissions('View:Tasks')
  findAll(
    @GetUser('id') userId: string,
    @GetUser('role') roleName: string,
    @Query('search') search?: string,
    @Query('pri') pri?: string,
    @Query('st') st?: string,
    @Query('assigneeId') assigneeId?: string,
  ) {
    return this.taskService.findAll(userId, roleName, { search, pri, st, assigneeId });
  }

  @Get(':id')
  @RequirePermissions('View:Tasks')
  findOne(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('role') roleName: string,
  ) {
    return this.taskService.findOne(id, userId, roleName);
  }

  @Put(':id')
  @RequirePermissions('Edit:Tasks')
  update(
    @Param('id') id: string,
    @Body() updateTaskDto: UpdateTaskDto,
    @GetUser('id') userId: string,
    @GetUser('role') roleName: string,
    @GetUser('name') userName: string,
  ) {
    return this.taskService.update(id, updateTaskDto, userId, roleName, userName);
  }

  @Put(':id/progress')
  @RequirePermissions('Edit:Tasks')
  updateProgress(
    @Param('id') id: string,
    @Body() updateProgressDto: UpdateTaskProgressDto,
    @GetUser('id') userId: string,
    @GetUser('role') roleName: string,
    @GetUser('name') userName: string,
  ) {
    return this.taskService.updateProgress(id, updateProgressDto, userId, roleName, userName);
  }

  @Put(':id/status')
  @RequirePermissions('Edit:Tasks')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @GetUser('id') userId: string,
    @GetUser('role') roleName: string,
  ) {
    return this.taskService.updateStatus(id, status, userId, roleName);
  }

  @Delete(':id')
  @RequirePermissions('Delete:Tasks')
  remove(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('role') roleName: string,
    @GetUser('name') userName: string,
  ) {
    return this.taskService.remove(id, userId, roleName, userName);
  }
}
