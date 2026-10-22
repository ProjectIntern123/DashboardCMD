import {
  sanitizeAuditPayload,
  isDataUri,
  isLikelyRawBase64,
  isSensitiveKey,
  BINARY_ATTACHMENT_OMITTED_MARKER,
  REDACTED_MARKER,
} from './audit-sanitizer';

describe('Audit Log Payload Sanitizer (audit-sanitizer.ts)', () => {
  describe('Helper Functions', () => {
    it('isSensitiveKey correctly identifies sensitive credentials and tokens', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('passwordHash')).toBe(true);
      expect(isSensitiveKey('userPassword')).toBe(true);
      expect(isSensitiveKey('mfaSecret')).toBe(true);
      expect(isSensitiveKey('token')).toBe(true);
      expect(isSensitiveKey('refreshToken')).toBe(true);
      expect(isSensitiveKey('accessToken')).toBe(true);
      expect(isSensitiveKey('secret')).toBe(true);
      expect(isSensitiveKey('secretKey')).toBe(true);
      expect(isSensitiveKey('apiKey')).toBe(true);
      expect(isSensitiveKey('otp')).toBe(true);
      expect(isSensitiveKey('otpCode')).toBe(true);
      expect(isSensitiveKey('keyHash')).toBe(true);

      // Business fields must NOT be sensitive
      expect(isSensitiveKey('title')).toBe(false);
      expect(isSensitiveKey('name')).toBe(false);
      expect(isSensitiveKey('email')).toBe(false);
      expect(isSensitiveKey('stage')).toBe(false);
      expect(isSensitiveKey('status')).toBe(false);
      expect(isSensitiveKey('detail')).toBe(false);
      expect(isSensitiveKey('risks')).toBe(false);
      expect(isSensitiveKey('rem')).toBe(false);
      expect(isSensitiveKey('attachments')).toBe(false);
      expect(isSensitiveKey(undefined)).toBe(false);
    });

    it('isDataUri correctly identifies Base64 data URIs', () => {
      expect(isDataUri('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=')).toBe(true);
      expect(isDataUri('data:application/pdf;base64,JVBERi0xLjQKJ...')).toBe(true);
      expect(isDataUri('DATA:IMAGE/JPEG;BASE64,/9j/4AAQSkZJRg==')).toBe(true);

      // Non-data URIs
      expect(isDataUri('https://hartek.com/image.png')).toBe(false);
      expect(isDataUri('/uploads/doc.pdf')).toBe(false);
      expect(isDataUri('Plain text note')).toBe(false);
      expect(isDataUri(123 as any)).toBe(false);
    });

    it('isLikelyRawBase64 detects long raw Base64 strings without spaces', () => {
      const longBase64 = 'A'.repeat(300);
      expect(isLikelyRawBase64(longBase64)).toBe(true);

      // With spaces (normal English text)
      const longTextWithSpaces = 'A '.repeat(150);
      expect(isLikelyRawBase64(longTextWithSpaces)).toBe(false);

      // Web URLs must not be marked as base64
      const longUrl = 'https://hartek.com/some/very/long/path/to/resource/' + 'a'.repeat(250);
      expect(isLikelyRawBase64(longUrl)).toBe(false);

      // Short strings
      expect(isLikelyRawBase64('ShortString')).toBe(false);
    });
  });

  describe('sanitizeAuditPayload() - Core Sanitization Rules', () => {
    it('1. Replaces Base64 Data URIs in attachments while preserving metadata', () => {
      const payload = {
        id: 'proj-101',
        name: 'Solar Substation 66kV',
        attachments: [
          {
            id: 'att-1',
            name: 'Single_Line_Diagram.pdf',
            type: 'application/pdf',
            size: 2048576,
            path: null,
            data: 'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovQ3JlYXRvcg==',
          },
          {
            id: 'att-2',
            name: 'Site_Photo.png',
            type: 'image/png',
            size: 1048576,
            path: null,
            data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
      };

      const sanitized = sanitizeAuditPayload(payload);

      expect(sanitized.id).toBe('proj-101');
      expect(sanitized.name).toBe('Solar Substation 66kV');
      expect(sanitized.attachments).toHaveLength(2);

      // Attachment 1 metadata preserved, data omitted
      expect(sanitized.attachments[0].id).toBe('att-1');
      expect(sanitized.attachments[0].name).toBe('Single_Line_Diagram.pdf');
      expect(sanitized.attachments[0].type).toBe('application/pdf');
      expect(sanitized.attachments[0].size).toBe(2048576);
      expect(sanitized.attachments[0].path).toBeNull();
      expect(sanitized.attachments[0].data).toBe(BINARY_ATTACHMENT_OMITTED_MARKER);

      // Attachment 2 metadata preserved, data omitted
      expect(sanitized.attachments[1].id).toBe('att-2');
      expect(sanitized.attachments[1].name).toBe('Site_Photo.png');
      expect(sanitized.attachments[1].type).toBe('image/png');
      expect(sanitized.attachments[1].size).toBe(1048576);
      expect(sanitized.attachments[1].data).toBe(BINARY_ATTACHMENT_OMITTED_MARKER);
    });

    it('2. Replaces raw Base64 data in attachment objects', () => {
      const payload = {
        name: 'BOQ_Estimate.xlsx',
        size: 50000,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        data: 'UEsDBBQAAAAIAAAAIQD0bN8gXQAAAHkAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbKyRy07DMBBF90j8Q+UrShswdMEtNiyqBBLoA8b2JFaN7XjsBvr3TNNWpYTEgsWSR3rnzj2e0ffjW4pBvQ4U',
      };

      const sanitized = sanitizeAuditPayload(payload);

      expect(sanitized.name).toBe('BOQ_Estimate.xlsx');
      expect(sanitized.size).toBe(50000);
      expect(sanitized.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(sanitized.data).toBe(BINARY_ATTACHMENT_OMITTED_MARKER);
    });

    it('3. Replaces Data URIs in settings / branding fields', () => {
      const settingsPayload = {
        app_name: 'HARTEK CMD Command Center',
        app_logo: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0icmVkIiAvPjwvc3ZnPg==',
        login_bg_image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
        primary_color: '#002B49',
        admin_theme_mode: 'dark',
      };

      const sanitized = sanitizeAuditPayload(settingsPayload);

      expect(sanitized.app_name).toBe('HARTEK CMD Command Center');
      expect(sanitized.primary_color).toBe('#002B49');
      expect(sanitized.admin_theme_mode).toBe('dark');
      expect(sanitized.app_logo).toBe(BINARY_ATTACHMENT_OMITTED_MARKER);
      expect(sanitized.login_bg_image).toBe(BINARY_ATTACHMENT_OMITTED_MARKER);
    });

    it('4. Handles NotepadNote images array of objects', () => {
      const notePayload = {
        id: 'note-55',
        title: 'Site Visit Notes',
        text: 'Inspected switchyard foundations and cable trenches.',
        images: [
          {
            id: 'img-1',
            name: 'Trench_Inspection.jpg',
            data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
          },
        ],
      };

      const sanitized = sanitizeAuditPayload(notePayload);

      expect(sanitized.id).toBe('note-55');
      expect(sanitized.title).toBe('Site Visit Notes');
      expect(sanitized.text).toBe('Inspected switchyard foundations and cable trenches.');
      expect(sanitized.images).toHaveLength(1);
      expect(sanitized.images[0].id).toBe('img-1');
      expect(sanitized.images[0].name).toBe('Trench_Inspection.jpg');
      expect(sanitized.images[0].data).toBe(BINARY_ATTACHMENT_OMITTED_MARKER);
    });

    it('5. Handles NotepadNote images as stringified JSON in request bodies', () => {
      const rawImages = [
        {
          id: 'img-2',
          name: 'Transformer.jpg',
          data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...',
        },
      ];

      const requestBody = {
        title: 'Meeting Notes with Client',
        text: 'Action items agreed upon.',
        images: JSON.stringify(rawImages),
      };

      const sanitized = sanitizeAuditPayload(requestBody);

      expect(sanitized.title).toBe('Meeting Notes with Client');
      expect(sanitized.text).toBe('Action items agreed upon.');
      expect(typeof sanitized.images).toBe('string');

      // Parse the sanitized JSON string to verify content
      const parsedImages = JSON.parse(sanitized.images);
      expect(parsedImages).toHaveLength(1);
      expect(parsedImages[0].id).toBe('img-2');
      expect(parsedImages[0].name).toBe('Transformer.jpg');
      expect(parsedImages[0].data).toBe(BINARY_ATTACHMENT_OMITTED_MARKER);
    });

    it('6. Redacts sensitive credentials (passwords, tokens, secrets, MFA)', () => {
      const userPayload = {
        id: 'usr-99',
        email: 'admin@hartek.com',
        name: 'System Admin',
        role: 'Admin',
        password: 'SuperSecretPassword123!',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz1234567890',
        mfaSecret: 'JBSWY3DPEHPK3PXP',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'dGhpc2lzYXJlZnJlc2h0b2tlbg==',
        otpCode: '849201',
      };

      const sanitized = sanitizeAuditPayload(userPayload);

      expect(sanitized.id).toBe('usr-99');
      expect(sanitized.email).toBe('admin@hartek.com');
      expect(sanitized.name).toBe('System Admin');
      expect(sanitized.role).toBe('Admin');
      expect(sanitized.password).toBe(REDACTED_MARKER);
      expect(sanitized.passwordHash).toBe(REDACTED_MARKER);
      expect(sanitized.mfaSecret).toBe(REDACTED_MARKER);
      expect(sanitized.token).toBe(REDACTED_MARKER);
      expect(sanitized.refreshToken).toBe(REDACTED_MARKER);
      expect(sanitized.otpCode).toBe(REDACTED_MARKER);
    });

    it('7. Preserves ordinary business fields across all core domains', () => {
      const complexEntity = {
        project: {
          name: '400kV Substation EPC',
          stage: 'Execution',
          health: 'Amber',
          order: '150.0000',
          prog: 75,
          billed: '110.5000',
          collected: '95.0000',
          milestone: 'Transformer Testing',
          risks: 'Pending OEM clearance for CTs',
          rem: 'Target commissioning Q4',
        },
        task: {
          title: 'Finalize Vendor Inspection',
          detail: 'Coordinate with quality team for on-site FAT',
          pri: 'High',
          due: '2026-11-15',
          st: 'In Progress',
          cd: null,
          note: 'Inspection scheduled for next Tuesday',
        },
        meeting: {
          name: 'Monthly Executive Review',
          cat: 'cmd',
          status: 'scheduled',
          agenda: 'Q3 Capex and Project Milestones',
          attendees: 'MD, CMD, VP Projects',
          momActions: ['Prepare revised cash flow', 'Follow up with DISCOM'],
        },
        legalCase: {
          title: 'HPPL vs State Electricity Board',
          court: 'High Court',
          status: 'Active',
          risk: 'Medium',
          timeline: [
            { date: '2026-09-10', note: 'Rejoinder filed' },
            { date: '2026-10-15', note: 'Arguments heard in part' },
          ],
        },
      };

      const sanitized = sanitizeAuditPayload(complexEntity);

      // Verify all business fields are exactly preserved
      expect(sanitized.project).toEqual(complexEntity.project);
      expect(sanitized.task).toEqual(complexEntity.task);
      expect(sanitized.meeting).toEqual(complexEntity.meeting);
      expect(sanitized.legalCase).toEqual(complexEntity.legalCase);
    });

    it('8. GUARANTEE: Does not mutate the original input payload in place', () => {
      const originalPayload = {
        id: 'task-1',
        title: 'Maintain audit trail',
        password: 'originalPassword',
        attachments: [
          {
            id: 'att-1',
            name: 'OriginalDoc.pdf',
            type: 'application/pdf',
            size: 100,
            data: 'data:application/pdf;base64,ORIGINAL_DATA',
          },
        ],
      };

      // Take a deep snapshot before sanitization
      const snapshotBefore = JSON.parse(JSON.stringify(originalPayload));

      const sanitized = sanitizeAuditPayload(originalPayload);

      // Verify sanitized has changes
      expect(sanitized.password).toBe(REDACTED_MARKER);
      expect(sanitized.attachments[0].data).toBe(BINARY_ATTACHMENT_OMITTED_MARKER);

      // Verify original is strictly untouched
      expect(originalPayload).toEqual(snapshotBefore);
      expect(originalPayload.password).toBe('originalPassword');
      expect(originalPayload.attachments[0].data).toBe('data:application/pdf;base64,ORIGINAL_DATA');

      // Verify object identity: sanitized must be a new object reference
      expect(sanitized).not.toBe(originalPayload);
      expect(sanitized.attachments).not.toBe(originalPayload.attachments);
      expect(sanitized.attachments[0]).not.toBe(originalPayload.attachments[0]);
    });

    it('9. Handles circular references safely without throwing', () => {
      const circularObj: any = {
        id: 'circ-1',
        name: 'Circular Node',
      };
      circularObj.self = circularObj;

      const sanitized = sanitizeAuditPayload(circularObj);

      expect(sanitized.id).toBe('circ-1');
      expect(sanitized.name).toBe('Circular Node');
      expect(sanitized.self).toBe('[CIRCULAR]');
    });

    it('10. Handles primitives, Dates, and edge cases gracefully', () => {
      expect(sanitizeAuditPayload(null)).toBeNull();
      expect(sanitizeAuditPayload(undefined)).toBeUndefined();
      expect(sanitizeAuditPayload(42)).toBe(42);
      expect(sanitizeAuditPayload(true)).toBe(true);
      expect(sanitizeAuditPayload(false)).toBe(false);
      expect(sanitizeAuditPayload('')).toBe('');
      expect(sanitizeAuditPayload([])).toEqual([]);
      expect(sanitizeAuditPayload({})).toEqual({});

      const now = new Date('2026-10-21T10:00:00.000Z');
      expect(sanitizeAuditPayload(now)).toBe('2026-10-21T10:00:00.000Z');

      // Prisma Decimal simulation
      const mockDecimal = {
        d: [1250],
        e: 2,
        s: 1,
        toFixed: () => '12.50',
        toString: () => '12.5000',
      };
      expect(sanitizeAuditPayload(mockDecimal)).toBe('12.5000');
    });
  });
});
