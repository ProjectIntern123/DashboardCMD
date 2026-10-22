import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { BINARY_ATTACHMENT_OMITTED_MARKER, REDACTED_MARKER } from './audit-sanitizer';

describe('AuditInterceptor (audit.interceptor.ts)', () => {
  let interceptor: AuditInterceptor;
  let mockAuditService: Partial<AuditService>;
  let mockPrismaService: any;

  beforeEach(() => {
    mockAuditService = {
      log: jest.fn().mockResolvedValue({ id: 'audit-log-1' } as any),
    };

    mockPrismaService = {
      project: {
        findFirst: jest.fn(),
      },
      task: {
        findFirst: jest.fn(),
      },
    };

    interceptor = new AuditInterceptor(
      mockAuditService as AuditService,
      mockPrismaService as PrismaService,
    );
  });

  function createMockExecutionContext(options: {
    method: string;
    url: string;
    body?: any;
    params?: any;
    user?: any;
    headers?: Record<string, string>;
  }): ExecutionContext {
    const req = {
      method: options.method,
      url: options.url,
      route: { path: options.url },
      body: options.body || {},
      params: options.params || {},
      user: options.user || { id: 'u1', email: 'admin@hartek.com', name: 'Admin' },
      headers: options.headers || { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      ip: '127.0.0.1',
    };

    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({}),
      }),
    } as unknown as ExecutionContext;
  }

  function createMockCallHandler(responseValue: any): CallHandler {
    return {
      handle: () => of(responseValue),
    };
  }

  it('bypasses auditing for non-modifying HTTP methods (GET)', async () => {
    const context = createMockExecutionContext({
      method: 'GET',
      url: '/projects',
    });
    const handler = createMockCallHandler([{ id: 'p1', name: 'Project 1' }]);

    const result$ = await interceptor.intercept(context, handler);
    let emitted: any;
    result$.subscribe((val) => {
      emitted = val;
    });

    expect(emitted).toEqual([{ id: 'p1', name: 'Project 1' }]);
    expect(mockAuditService.log).not.toHaveBeenCalled();
  });

  it('bypasses auditing for excluded auth endpoints (e.g. /auth/login)', async () => {
    const context = createMockExecutionContext({
      method: 'POST',
      url: '/auth/login',
      body: { email: 'admin@hartek.com', password: 'SecretPassword' },
    });
    const handler = createMockCallHandler({ accessToken: 'jwt-token' });

    const result$ = await interceptor.intercept(context, handler);
    let emitted: any;
    result$.subscribe((val) => {
      emitted = val;
    });

    expect(emitted).toEqual({ accessToken: 'jwt-token' });
    expect(mockAuditService.log).not.toHaveBeenCalled();
  });

  it('sanitizes Base64 attachments and credentials in POST responses', async () => {
    const context = createMockExecutionContext({
      method: 'POST',
      url: '/projects',
      body: { name: 'New Substation' },
    });

    const responsePayload = {
      id: 'proj-new',
      name: 'New Substation',
      stage: 'Planning',
      passwordHash: 'secretHashShouldNotBeLogged',
      attachments: [
        {
          id: 'att-1',
          name: 'Spec.pdf',
          size: 1048576,
          type: 'application/pdf',
          data: 'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovQ3JlYXRvcg==',
        },
      ],
    };

    const handler = createMockCallHandler(responsePayload);

    const result$ = await interceptor.intercept(context, handler);
    let emitted: any;
    result$.subscribe((val) => {
      emitted = val;
    });

    // Verify response is returned intact to caller
    expect(emitted).toBe(responsePayload);
    expect(emitted.attachments[0].data).toContain('data:application/pdf;base64');

    // Wait for async tap() execution
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockAuditService.log).toHaveBeenCalledTimes(1);
    const loggedParams = (mockAuditService.log as jest.Mock).mock.calls[0][0];

    expect(loggedParams.action).toBe('Created Project');
    expect(loggedParams.newValues.name).toBe('New Substation');
    expect(loggedParams.newValues.passwordHash).toBe(REDACTED_MARKER);
    expect(loggedParams.newValues.attachments[0].id).toBe('att-1');
    expect(loggedParams.newValues.attachments[0].name).toBe('Spec.pdf');
    expect(loggedParams.newValues.attachments[0].size).toBe(1048576);
    expect(loggedParams.newValues.attachments[0].data).toBe(BINARY_ATTACHMENT_OMITTED_MARKER);
  });

  it('sanitizes fallback req.body when response is null or undefined', async () => {
    const requestBody = {
      title: 'Task via fallback',
      password: 'mypassword',
      attachments: [
        {
          name: 'doc.pdf',
          size: 500,
          type: 'application/pdf',
          data: 'data:application/pdf;base64,AAAA',
        },
      ],
    };

    const context = createMockExecutionContext({
      method: 'POST',
      url: '/tasks',
      body: requestBody,
    });

    const handler = createMockCallHandler(null);

    const result$ = await interceptor.intercept(context, handler);
    result$.subscribe();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockAuditService.log).toHaveBeenCalledTimes(1);
    const loggedParams = (mockAuditService.log as jest.Mock).mock.calls[0][0];

    expect(loggedParams.newValues.title).toBe('Task via fallback');
    expect(loggedParams.newValues.password).toBe(REDACTED_MARKER);
    expect(loggedParams.newValues.attachments[0].data).toBe(BINARY_ATTACHMENT_OMITTED_MARKER);
    expect(loggedParams.newValues.attachments[0].name).toBe('doc.pdf');

    // Ensure original req.body was not mutated
    expect(requestBody.password).toBe('mypassword');
    expect(requestBody.attachments[0].data).toBe('data:application/pdf;base64,AAAA');
  });

  it('fetches and sanitizes oldValues for PUT operations', async () => {
    const oldProject = {
      id: 'p-123',
      name: 'Old Project Name',
      passwordHash: 'oldHash',
      app_logo: 'data:image/png;base64,OLD_LOGO',
    };
    mockPrismaService.project.findFirst.mockResolvedValue(oldProject);

    const context = createMockExecutionContext({
      method: 'PUT',
      url: '/projects/p-123',
      params: { id: 'p-123' },
      body: { name: 'Updated Project Name' },
    });

    const handler = createMockCallHandler({
      id: 'p-123',
      name: 'Updated Project Name',
    });

    const result$ = await interceptor.intercept(context, handler);
    result$.subscribe();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockPrismaService.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-123', deletedAt: null },
    });

    expect(mockAuditService.log).toHaveBeenCalledTimes(1);
    const loggedParams = (mockAuditService.log as jest.Mock).mock.calls[0][0];

    expect(loggedParams.oldValues.name).toBe('Old Project Name');
    expect(loggedParams.oldValues.passwordHash).toBe(REDACTED_MARKER);
    expect(loggedParams.oldValues.app_logo).toBe(BINARY_ATTACHMENT_OMITTED_MARKER);
    expect(loggedParams.newValues.name).toBe('Updated Project Name');
  });

  it('silently swallows auditService errors without throwing or failing the request', async () => {
    (mockAuditService.log as jest.Mock).mockRejectedValue(new Error('Audit DB is unavailable'));

    const context = createMockExecutionContext({
      method: 'POST',
      url: '/tasks',
      body: { title: 'Safe task' },
    });

    const handler = createMockCallHandler({ id: 't-1', title: 'Safe task' });

    const result$ = await interceptor.intercept(context, handler);

    let emitted: any;
    let errorCaught: any = null;
    result$.subscribe({
      next: (val) => {
        emitted = val;
      },
      error: (err) => {
        errorCaught = err;
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Request must complete smoothly without error
    expect(emitted).toEqual({ id: 't-1', title: 'Safe task' });
    expect(errorCaught).toBeNull();
  });
});
