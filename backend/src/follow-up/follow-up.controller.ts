import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { FollowUpService } from './follow-up.service';
import { CreateFollowUpDto, UpdateFollowUpDto } from './dto/follow-up.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('follow-ups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  @Post()
  @RequirePermissions('Create:Followups')
  create(@Body() createFollowUpDto: CreateFollowUpDto, @GetUser('id') userId: string) {
    return this.followUpService.create(createFollowUpDto, userId);
  }

  @Get()
  @RequirePermissions('View:Followups')
  findAll(
    @Query('search') search?: string,
    @Query('priority') priority?: string,
    @Query('st') st?: string,
    @Query('bu') bu?: string,
  ) {
    return this.followUpService.findAll({ search, priority, st, bu });
  }

  @Get(':id')
  @RequirePermissions('View:Followups')
  findOne(@Param('id') id: string) {
    return this.followUpService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('Edit:Followups')
  update(
    @Param('id') id: string,
    @Body() updateFollowUpDto: UpdateFollowUpDto,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.followUpService.update(id, updateFollowUpDto, userId, userName);
  }

  @Put(':id/status')
  @RequirePermissions('Edit:Followups')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.followUpService.updateStatus(id, status, userId, userName);
  }

  @Delete(':id')
  @RequirePermissions('Delete:Followups')
  remove(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.followUpService.remove(id, userId, userName);
  }
}
