import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ActionItemService } from './action-item.service';
import { CreateActionItemDto, UpdateActionItemDto } from './dto/action-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('action-items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ActionItemController {
  constructor(private readonly actionItemService: ActionItemService) {}

  @Post()
  @RequirePermissions('Create:Actions')
  create(@Body() createActionItemDto: CreateActionItemDto, @GetUser('id') userId: string) {
    return this.actionItemService.create(createActionItemDto, userId);
  }

  @Get()
  @RequirePermissions('View:Actions')
  findAll(
    @Query('search') search?: string,
    @Query('pri') pri?: string,
    @Query('st') st?: string,
    @Query('dept') dept?: string,
  ) {
    return this.actionItemService.findAll({ search, pri, st, dept });
  }

  @Get(':id')
  @RequirePermissions('View:Actions')
  findOne(@Param('id') id: string) {
    return this.actionItemService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('Edit:Actions')
  update(
    @Param('id') id: string,
    @Body() updateActionItemDto: UpdateActionItemDto,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.actionItemService.update(id, updateActionItemDto, userId, userName);
  }

  @Put(':id/status')
  @RequirePermissions('Edit:Actions')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.actionItemService.updateStatus(id, status, userId, userName);
  }

  @Put(':id/priority')
  @RequirePermissions('Edit:Actions')
  updatePriority(
    @Param('id') id: string,
    @Body('priority') priority: string,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.actionItemService.updatePriority(id, priority, userId, userName);
  }

  @Delete(':id')
  @RequirePermissions('Delete:Actions')
  remove(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.actionItemService.remove(id, userId, userName);
  }
}
