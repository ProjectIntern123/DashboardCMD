import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    // Parallel queries to fetch operational counts from live PostgreSQL tables
    const [
      employeesCount,
      customersCount,
      vendorsCount,
      workflowsCount,
      auditLogsCount,
      projectBilledSum,
    ] = await Promise.all([
      this.prisma.employee.count(),
      this.prisma.customer.count(),
      this.prisma.vendor.count(),
      this.prisma.workflow.count(),
      this.prisma.auditLog.count(),
      this.prisma.project.aggregate({
        where: { deletedAt: null },
        _sum: {
          billed: true,
        },
      }),
    ]);

    // Format billed sum to a number or 0.0
    const billedSum = projectBilledSum._sum.billed 
      ? Number(projectBilledSum._sum.billed) 
      : 0.0;

    return {
      employeesCount,
      customersCount,
      vendorsCount,
      workflowsCount,
      auditLogsCount,
      totalBilled: billedSum,
    };
  }
}
