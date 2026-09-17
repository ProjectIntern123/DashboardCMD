import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { EscalationService } from './escalation.service';
import { CreateEscalationDto, UpdateEscalationDto } from './dto/escalation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('escalations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EscalationController {
  constructor(private readonly escalationService: EscalationService) {}

  @Post()
  @RequirePermissions('Create:Escalations')
  create(@Body() createEscalationDto: CreateEscalationDto, @GetUser('id') userId: string) {
    return this.escalationService.create(createEscalationDto, userId);
  }

  @Get()
  @RequirePermissions('View:Escalations')
  findAll(
    @Query('search') search?: string,
    @Query('sev') sev?: string,
    @Query('st') st?: string,
  ) {
    return this.escalationService.findAll({ search, sev, st });
  }

  @Get(':id')
  @RequirePermissions('View:Escalations')
  findOne(@Param('id') id: string) {
    return this.escalationService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('Edit:Escalations')
  update(
    @Param('id') id: string,
    @Body() updateEscalationDto: UpdateEscalationDto,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.escalationService.update(id, updateEscalationDto, userId, userName);
  }

  @Put(':id/status')
  @RequirePermissions('Edit:Escalations')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.escalationService.updateStatus(id, status, userId, userName);
  }

  @Delete(':id')
  @RequirePermissions('Delete:Escalations')
  remove(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.escalationService.remove(id, userId, userName);
  }
}
