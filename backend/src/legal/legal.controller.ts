import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile, HttpStatus, HttpCode, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LegalService } from './legal.service';
import { SettingsService } from '../settings/settings.service';
import { CreateLegalCaseDto, UpdateLegalCaseDto } from './dto/legal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortalGuard } from '../auth/guards/portal.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { UserPortalOnly } from '../auth/decorators/portal.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('legal-cases')
@UseGuards(JwtAuthGuard, PortalGuard, PermissionsGuard)
@UserPortalOnly()
export class LegalController {
  constructor(
    private readonly legalService: LegalService,
    private readonly settingsService: SettingsService,
  ) {}

  @Post()
  @RequirePermissions('Create:Legal')
  create(@Body() createLegalCaseDto: CreateLegalCaseDto, @GetUser('id') userId: string) {
    return this.legalService.create(createLegalCaseDto, userId);
  }

  @Get()
  @RequirePermissions('View:Legal')
  findAll(
    @Query('search') search?: string,
    @Query('court') court?: string,
    @Query('status') status?: string,
    @Query('risk') risk?: string,
    @Query('entity') entity?: string,
    @Query('filedBy') filedBy?: string,
  ) {
    return this.legalService.findAll({ search, court, status, risk, entity, filedBy });
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('Import:Legal')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @UploadedFile() file: any,
    @Query('mode') mode: 'smartSync' | 'replace' = 'smartSync',
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    if (!file) {
      throw new BadRequestException('No CSV file uploaded');
    }
    await this.settingsService.validateFileSize(
      file.size || file.buffer?.length || 0,
      file.originalname || 'MIS File',
    );
    const csvContent = file.buffer.toString('utf-8');
    return this.legalService.importCsv(csvContent, mode, userId, userName);
  }

  @Get(':id')
  @RequirePermissions('View:Legal')
  findOne(@Param('id') id: string) {
    return this.legalService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('Edit:Legal')
  update(
    @Param('id') id: string,
    @Body() updateLegalCaseDto: UpdateLegalCaseDto,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.legalService.update(id, updateLegalCaseDto, userId, userName);
  }

  @Delete(':id')
  @RequirePermissions('Delete:Legal')
  remove(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('name') userName: string,
  ) {
    return this.legalService.remove(id, userId, userName);
  }
}
