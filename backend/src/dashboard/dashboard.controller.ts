import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortalGuard } from '../auth/guards/portal.guard';
import { UserPortalOnly } from '../auth/decorators/portal.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PortalGuard)
@UserPortalOnly()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  async getStats() {
    return this.dashboardService.getStats();
  }
}
