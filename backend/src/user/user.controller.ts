import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortalGuard } from '../auth/guards/portal.guard';
import { SharedPortal, AdminPortalOnly } from '../auth/decorators/portal.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, PortalGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @SharedPortal()
  @Get()
  findAll(@GetUser('role') role: string) {
    return this.userService.findAll(role);
  }

  @AdminPortalOnly()
  @Get('sessions')
  findSessions(@GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can view session logs');
    }
    return this.userService.findSessionLogs(role);
  }

  @AdminPortalOnly()
  @Get('stats')
  findStats(@GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can access statistics');
    }
    return this.userService.getAdminStats(role);
  }

  @AdminPortalOnly()
  @Post()
  create(@Body() dto: any, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can create users');
    }
    return this.userService.create(dto);
  }

  @AdminPortalOnly()
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: any,
    @GetUser('role') role: string,
    @GetUser('id') actorId: string,
    @GetUser('email') actorEmail: string,
  ) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can update users');
    }
    return this.userService.update(id, dto, actorId, actorEmail);
  }

  @AdminPortalOnly()
  @Post(':id/reset-password-temp')
  resetPasswordTemp(@Param('id') id: string, @GetUser('role') role: string) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can reset user passwords');
    }
    return this.userService.resetPasswordTemp(id);
  }

  @AdminPortalOnly()
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @GetUser('role') role: string,
    @GetUser('id') actorId: string,
    @GetUser('email') actorEmail: string,
  ) {
    if (role !== 'Admin') {
      throw new ForbiddenException('Only administrators can delete users');
    }
    return this.userService.remove(id, actorId, actorEmail);
  }
}
