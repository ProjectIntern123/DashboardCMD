import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { EmailTemplatesService, SYSTEM_NOTIFICATION_EVENTS } from './email-templates.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('email-templates')
@UseGuards(JwtAuthGuard)
export class EmailTemplatesController {
  constructor(private readonly emailTemplatesService: EmailTemplatesService) {}

  @Get('events')
  getSystemEvents(@GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can access system notification templates.');
    }
    return SYSTEM_NOTIFICATION_EVENTS;
  }

  @Get()
  findAll(@GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can access system notification templates.');
    }
    return this.emailTemplatesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can access system notification templates.');
    }
    return this.emailTemplatesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateEmailTemplateDto, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can create email templates.');
    }
    return this.emailTemplatesService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can update email templates.');
    }
    return this.emailTemplatesService.update(id, dto);
  }

  @Patch(':id/toggle')
  toggleActive(@Param('id') id: string, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can enable/disable email templates.');
    }
    return this.emailTemplatesService.toggleActive(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can delete email templates.');
    }
    return this.emailTemplatesService.remove(id);
  }

  @Post('preview')
  preview(@Body() body: { id?: string; subject?: string; body?: string; sampleVariables?: Record<string, any> }, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can preview email templates.');
    }
    return this.emailTemplatesService.preview(body);
  }
}
