import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private auditService: AuditService,
    private prisma: PrismaService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest();
    const method = req.method;

    // Only audit modifying actions (POST, PUT, DELETE)
    if (!['POST', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const path = req.route?.path || req.url;
    // Don't audit auth login/logout, forgot/reset password endpoints to avoid capturing passwords
    if (
      path.includes('/auth/login') ||
      path.includes('/auth/reset-password') ||
      path.includes('/auth/forgot-password')
    ) {
      return next.handle();
    }

    const user = req.user;
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    const ua = req.headers['user-agent'] || '';

    // If PUT/DELETE, try to fetch the pre-edit DB record for full delta analysis
    let oldValues: any = null;
    const idParam = req.params?.id;

    if (idParam && ['PUT', 'DELETE'].includes(method)) {
      try {
        const table = this.determineTable(path);
        if (table) {
          oldValues = await (this.prisma as any)[table].findFirst({
            where: { id: idParam, deletedAt: null },
          });
        }
      } catch (err) {
        // Suppress errors to ensure original request proceeds smoothly
      }
    }

    return next.handle().pipe(
      tap(async (response) => {
        try {
          const activeUser = req.user || user;
          if (!activeUser) return;

          const action = `${this.mapMethodToAction(method)} ${this.mapPathToResource(path)}`;

          // Extract values to audit
          let finalResponse = response;
          if (response) {
            finalResponse = JSON.parse(JSON.stringify(response));
            // Remove sensitive fields
            delete finalResponse.passwordHash;
            delete finalResponse.mfaSecret;
          }

          let oldFiltered = oldValues;
          if (oldValues) {
            oldFiltered = JSON.parse(JSON.stringify(oldValues));
            delete oldFiltered.passwordHash;
            delete oldFiltered.mfaSecret;
          }

          await this.auditService.log({
            userId: activeUser.id,
            userEmail: activeUser.email,
            userName: activeUser.name,
            action,
            detail: `Path processed: ${req.url}`,
            ipAddress: ip,
            userAgent: ua,
            oldValues: oldFiltered,
            newValues: finalResponse || req.body,
          });
        } catch (e) {
          // Keep errors silent so request flow is unaffected
        }
      }),
    );
  }

  private determineTable(path: string): string | null {
    if (path.includes('/projects')) return 'project';
    if (path.includes('/meetings')) return 'meeting';
    if (path.includes('/tasks')) return 'task';
    if (path.includes('/action-items')) return 'actionItem';
    if (path.includes('/escalations')) return 'escalation';
    if (path.includes('/follow-ups')) return 'followUp';
    if (path.includes('/legal-cases')) return 'legalCase';
    if (path.includes('/notepad')) return 'notepadNote';
    if (path.includes('/email-templates')) return 'emailTemplate';
    return null;
  }

  private mapMethodToAction(method: string): string {
    if (method === 'POST') return 'Created';
    if (method === 'PUT') return 'Updated';
    if (method === 'DELETE') return 'Deleted';
    return 'Modified';
  }

  private mapPathToResource(path: string): string {
    if (path.includes('/projects')) return 'Project';
    if (path.includes('/meetings')) return 'Meeting/Calendar';
    if (path.includes('/tasks')) return 'Task';
    if (path.includes('/action-items')) return 'Action Item';
    if (path.includes('/escalations')) return 'Escalation';
    if (path.includes('/follow-ups')) return 'Follow Up';
    if (path.includes('/legal-cases')) return 'Legal Case';
    if (path.includes('/notepad')) return 'Notepad Note';
    if (path.includes('/email-templates')) return 'Email Notification Template';
    return 'Resource';
  }
}
