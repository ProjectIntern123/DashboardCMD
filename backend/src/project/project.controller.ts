import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProjectService } from './project.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @RequirePermissions('Create:Projects')
  create(@Body() createProjectDto: CreateProjectDto, @GetUser('id') userId: string) {
    return this.projectService.create(createProjectDto, userId);
  }

  @Get()
  @RequirePermissions('View:Projects')
  findAll(
    @Query('search') search?: string,
    @Query('buId') buId?: string,
    @Query('stage') stage?: string,
    @Query('health') health?: string,
  ) {
    return this.projectService.findAll({ search, buId, stage, health });
  }

  @Get('departments')
  @RequirePermissions('View:Projects')
  findAllDepartments() {
    return this.projectService.findAllDepartments();
  }

  @Get(':id')
  @RequirePermissions('View:Projects')
  findOne(@Param('id') id: string) {
    return this.projectService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('Edit:Projects')
  update(
    @Param('id') id: string,
    @Body() updateProjectDto: UpdateProjectDto,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.projectService.update(id, updateProjectDto, userId, userName);
  }

  @Delete(':id')
  @RequirePermissions('Delete:Projects')
  remove(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.projectService.remove(id, userId, userName);
  }
}
