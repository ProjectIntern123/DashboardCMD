import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { CreateMeetingDto, UpdateMeetingDto, UpdateNotesDto } from './dto/meeting.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('meetings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Post()
  @RequirePermissions('Create:Calendar')
  create(@Body() createMeetingDto: CreateMeetingDto, @GetUser('id') userId: string) {
    return this.meetingService.create(createMeetingDto, userId);
  }

  @Get()
  @RequirePermissions('View:Calendar')
  findAll(
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('search') search?: string,
    @Query('cat') cat?: string,
  ) {
    return this.meetingService.findAll({ start, end, search, cat });
  }

  @Get(':id')
  @RequirePermissions('View:Calendar')
  findOne(@Param('id') id: string) {
    return this.meetingService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('Edit:Calendar')
  update(
    @Param('id') id: string,
    @Body() updateMeetingDto: UpdateMeetingDto,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.meetingService.update(id, updateMeetingDto, userId, userName);
  }

  @Put(':id/reschedule')
  @RequirePermissions('Edit:Calendar')
  reschedule(
    @Param('id') id: string,
    @Body('date') date: string,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.meetingService.reschedule(id, date, userId, userName);
  }

  @Put(':id/status')
  @RequirePermissions('Edit:Calendar')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.meetingService.updateStatus(id, status, userId, userName);
  }

  @Put(':id/notes')
  @RequirePermissions('Edit:Calendar')
  updateNotepad(
    @Param('id') id: string,
    @Body() updateNotesDto: UpdateNotesDto,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.meetingService.updateNotepad(id, updateNotesDto.notes, userId, userName);
  }

  @Delete(':id')
  @RequirePermissions('Delete:Calendar')
  remove(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.meetingService.remove(id, userId, userName);
  }
}
