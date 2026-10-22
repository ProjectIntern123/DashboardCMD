import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

@Injectable()
export class RecipientValidator {
  constructor(private prisma: PrismaService) {}

  /**
   * Validates an array of user UUIDs for task assignments.
   * Ensures IDs are well-formed UUIDs, exist in the system, and do NOT belong to Admin accounts.
   */
  async validateInternalUserIds(assigneeIds: string[]): Promise<string[]> {
    if (!assigneeIds || !Array.isArray(assigneeIds) || assigneeIds.length === 0) {
      throw new BadRequestException('At least one assignee is required');
    }

    // Deduplicate
    const uniqueIds = Array.from(new Set(assigneeIds.map(id => String(id || '').trim()).filter(Boolean)));

    if (uniqueIds.length === 0) {
      throw new BadRequestException('At least one valid assignee ID is required');
    }

    // Check UUID format
    for (const id of uniqueIds) {
      if (!UUID_REGEX.test(id)) {
        throw new BadRequestException(`Assignee ID '${id}' is not a valid UUID format`);
      }
    }

    // Query all users in one batch
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      include: { role: true },
    });

    if (users.length !== uniqueIds.length) {
      throw new BadRequestException('One or more assignee user IDs were not found in the system');
    }

    // Check for Admin accounts
    const adminUser = users.find(u => u.role?.name === 'Admin');
    if (adminUser) {
      throw new BadRequestException('Tasks cannot be assigned to Administrator accounts');
    }

    return uniqueIds;
  }

  /**
   * Validates mixed recipient representations (UUIDs or external emails) for Escalation, ActionItem, FollowUp.
   * Rejects Admin user IDs and Admin account emails (case-insensitive).
   * Preserves legitimate external email addresses.
   */
  async validateMixedRecipients(assignedTo: any): Promise<string[]> {
    if (assignedTo === null || assignedTo === undefined) {
      return [];
    }

    let items: string[] = [];
    if (Array.isArray(assignedTo)) {
      items = assignedTo;
    } else if (typeof assignedTo === 'string') {
      try {
        const parsed = JSON.parse(assignedTo);
        if (Array.isArray(parsed)) {
          items = parsed;
        } else {
          items = [assignedTo];
        }
      } catch (e) {
        items = [assignedTo];
      }
    } else {
      return [];
    }

    const cleanItems = Array.from(new Set(items.map(item => String(item || '').trim()).filter(Boolean)));
    if (cleanItems.length === 0) {
      return [];
    }

    const candidateUuids = cleanItems.filter(item => UUID_REGEX.test(item));
    const candidateEmails = cleanItems.filter(item => EMAIL_REGEX.test(item));

    // Validate internal UUIDs
    if (candidateUuids.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: candidateUuids } },
        include: { role: true },
      });

      const adminUser = users.find(u => u.role?.name === 'Admin');
      if (adminUser) {
        throw new BadRequestException('Records cannot be assigned to Administrator accounts');
      }
    }

    // Validate emails against Admin accounts (case-insensitive)
    if (candidateEmails.length > 0) {
      const adminUsers = await this.prisma.user.findMany({
        where: { role: { name: 'Admin' } },
        select: { email: true },
      });
      const adminEmailSet = new Set(adminUsers.map(u => u.email.toLowerCase().trim()));

      for (const email of candidateEmails) {
        if (adminEmailSet.has(email.toLowerCase().trim())) {
          throw new BadRequestException('Records cannot be assigned to Administrator accounts');
        }
      }
    }

    return cleanItems;
  }

  /**
   * Validates a delimited meeting attendees string.
   * Extracts email and UUID tokens and rejects matches with Admin accounts.
   * Preserves legitimate external attendees.
   */
  async validateAttendeesString(attendees: string | null | undefined): Promise<string | null> {
    if (!attendees || typeof attendees !== 'string' || !attendees.trim()) {
      return null;
    }

    const emailTokens = attendees.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const uuidTokens = attendees.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g) || [];

    if (emailTokens.length > 0) {
      const adminUsers = await this.prisma.user.findMany({
        where: { role: { name: 'Admin' } },
        select: { email: true },
      });
      const adminEmailSet = new Set(adminUsers.map(u => u.email.toLowerCase().trim()));

      for (const email of emailTokens) {
        if (adminEmailSet.has(email.toLowerCase().trim())) {
          throw new BadRequestException('System Administrator accounts cannot be added as meeting attendees');
        }
      }
    }

    if (uuidTokens.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: uuidTokens } },
        include: { role: true },
      });
      const adminUser = users.find(u => u.role?.name === 'Admin');
      if (adminUser) {
        throw new BadRequestException('System Administrator accounts cannot be added as meeting attendees');
      }
    }

    return attendees;
  }
}
