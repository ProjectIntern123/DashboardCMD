import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpStatus, HttpCode } from '@nestjs/common';
import { NotepadService } from './notepad.service';
import { CreateNoteDto, UpdateNoteDto } from './dto/notepad.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('notepad')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotepadController {
  constructor(private readonly notepadService: NotepadService) {}

  @Post()
  @RequirePermissions('Create:Notepad')
  create(@Body() createNoteDto: CreateNoteDto, @GetUser('id') userId: string) {
    return this.notepadService.create(createNoteDto, userId);
  }

  @Get()
  @RequirePermissions('View:Notepad')
  findAll(@GetUser('id') userId: string) {
    return this.notepadService.findAll(userId);
  }

  @Get(':id')
  @RequirePermissions('View:Notepad')
  findOne(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.notepadService.findOne(id, userId);
  }

  @Put(':id')
  @RequirePermissions('Edit:Notepad')
  update(
    @Param('id') id: string,
    @Body() updateNoteDto: UpdateNoteDto,
    @GetUser('id') userId: string,
  ) {
    return this.notepadService.update(id, updateNoteDto, userId);
  }

  @Delete('clear')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Delete:Notepad')
  clearAll(@GetUser('id') userId: string) {
    return this.notepadService.clearAll(userId);
  }

  @Delete(':id')
  @RequirePermissions('Delete:Notepad')
  remove(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.notepadService.remove(id, userId);
  }
}
