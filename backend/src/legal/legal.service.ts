import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLegalCaseDto, UpdateLegalCaseDto } from './dto/legal.dto';

@Injectable()
export class LegalService {
  constructor(private prisma: PrismaService) {}

  async create(createLegalCaseDto: any, userId: string) {
    const { attachments, ...data } = createLegalCaseDto;
    const timeline = data.timeline ? JSON.parse(data.timeline) : [];

    return this.prisma.legalCase.create({
      data: {
        srNo: data.srNo || null,
        group: data.group,
        filedBy: data.filedBy,
        nature: data.nature || '',
        title: data.title,
        caseNo: data.caseNo || null,
        court: data.court,
        counsel: data.counsel || null,
        entity: data.entity || null,
        handler: data.handler || 'HS',
        filed: data.filed || null,
        ldoh: data.ldoh || null,
        ndoh: data.ndoh || null,
        update: data.update || null,
        status: data.status,
        risk: data.risk,
        actionRequired: data.actionRequired || null,
        claim: data.claim || '-',
        bg: data.bg || null,
        timeline: timeline,
        attachments: {
          create: attachments?.map((att: any) => ({
            name: att.name,
            type: att.type,
            size: att.size,
            data: att.data,
          })) || [],
        },
      },
      include: {
        attachments: true,
      },
    });
  }

  async findAll(filters: { search?: string; court?: string; status?: string; risk?: string; entity?: string; filedBy?: string }) {
    const where: any = { deletedAt: null };

    if (filters.court) {
      where.court = filters.court;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.risk) {
      where.risk = filters.risk;
    }

    if (filters.entity) {
      where.entity = filters.entity;
    }

    if (filters.filedBy) {
      // If filedBy matches 'by' or 'against', we check the content
      if (filters.filedBy === 'by') {
        where.filedBy = { contains: 'Filed by' };
      } else if (filters.filedBy === 'against') {
        where.filedBy = { contains: 'Filed against' };
      }
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { caseNo: { contains: filters.search, mode: 'insensitive' } },
        { court: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const cases = await this.prisma.legalCase.findMany({
      where,
      include: {
        attachments: true,
      },
    });

    // Custom sorting: Critical > High > Medium > Low
    const riskOrder: Record<string, number> = {
      Critical: 0,
      High: 1,
      Medium: 2,
      Low: 3,
    };
    
    const statusOrder: Record<string, number> = {
      Active: 0,
      Pending: 1,
      Settled: 2,
      Favorable: 3,
    };

    return cases.sort((a, b) => {
      const scoreA = (riskOrder[a.risk] ?? 2) + (statusOrder[a.status] ?? 2);
      const scoreB = (riskOrder[b.risk] ?? 2) + (statusOrder[b.status] ?? 2);
      
      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }
      
      if (a.ndoh && b.ndoh) {
        return a.ndoh.localeCompare(b.ndoh);
      }
      return a.ndoh ? -1 : 1;
    });
  }

  async findOne(id: string) {
    const legalCase = await this.prisma.legalCase.findFirst({
      where: { id, deletedAt: null },
      include: {
        attachments: true,
        comments: {
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!legalCase) {
      throw new NotFoundException('Legal case not found or has been deleted');
    }

    return legalCase;
  }

  async update(id: string, updateLegalCaseDto: any, userId: string, userName: string) {
    await this.findOne(id);
    const { attachments, ...data } = updateLegalCaseDto;
    const timeline = data.timeline ? JSON.parse(data.timeline) : [];

    // Clean old attachments
    const existingAttIds = attachments?.map((a: any) => a.id).filter(Boolean) || [];
    await this.prisma.attachment.deleteMany({
      where: {
        legalCaseId: id,
        id: { notIn: existingAttIds },
      },
    });

    const newAttachments = attachments?.filter((a: any) => !a.id) || [];

    return this.prisma.legalCase.update({
      where: { id },
      data: {
        srNo: data.srNo || null,
        group: data.group,
        filedBy: data.filedBy,
        nature: data.nature || '',
        title: data.title,
        caseNo: data.caseNo || null,
        court: data.court,
        counsel: data.counsel || null,
        entity: data.entity || null,
        handler: data.handler || 'HS',
        filed: data.filed || null,
        ldoh: data.ldoh || null,
        ndoh: data.ndoh || null,
        update: data.update || null,
        status: data.status,
        risk: data.risk,
        actionRequired: data.actionRequired || null,
        claim: data.claim || '-',
        bg: data.bg || null,
        timeline: timeline,
        attachments: {
          create: newAttachments.map((att: any) => ({
            name: att.name,
            type: att.type,
            size: att.size,
            data: att.data,
          })),
        },
      },
      include: {
        attachments: true,
      },
    });
  }

  async importCsv(csvContent: string, mode: 'smartSync' | 'replace', userId: string, userName: string) {
    const lines = csvContent.split(/\r?\n/);
    if (lines.length < 2) {
      throw new BadRequestException('Empty CSV file or invalid rows');
    }

    const rows = lines.map(line => this.parseCsvLine(line));
    const header = rows[0].map(h => h.toUpperCase());

    // Map headers to column indices
    const ci = {
      srNo: header.findIndex(h => h.includes('S. NO') || h.includes('S.NO') || h.includes('SR NO') || h.includes('SNO')),
      nature: header.findIndex(h => h.includes('NATURE')),
      title: header.findIndex(h => h.includes('TITLE')),
      caseNo: header.findIndex(h => h.includes('CASE NUMBER') || h.includes('CASE NO')),
      counsel: header.findIndex(h => h.includes('EXTERNAL COUNSEL') || h.includes('COUNSEL')),
      court: header.findIndex(h => h.includes('COURT')),
      ldoh: header.findIndex(h => h.includes('LDOH')),
      ndoh: header.findIndex(h => h.includes('NDOH')),
      update: header.findIndex(h => h.includes('CASE STATUS') || h.includes('LISTED FOR') || h.includes('STATUS')),
      action: header.findIndex(h => h.includes('ACTION TO BE TAKEN') || h.includes('ACTION')),
      claim: header.findIndex(h => h.includes('CLAIM AMOUNT') || h.includes('CLAIM')),
    };

    if (ci.title === -1 || ci.caseNo === -1) {
      throw new BadRequestException('CSV must contain TITLE and CASE NUMBER columns at minimum');
    }

    const parsedCases: any[] = [];
    let seq = 0;
    let curSide = 'by'; // default filed by HPPL

    for (let i = 1; i < rows.length; i++) {
      const vals = rows[i];
      if (vals.length === 0 || (vals.length === 1 && vals[0] === '')) continue;

      const title = this.getCell(vals, ci.title);
      const caseNo = this.getCell(vals, ci.caseNo);
      const nature = this.getCell(vals, ci.nature);

      // Check if it's a side indicator banner row (e.g. "Filed by HPPL" or "Filed against HPPL")
      if (vals.length <= 2 && vals[0]) {
        const text = vals[0].toLowerCase();
        if (text.includes('against')) {
          curSide = 'against';
        } else if (text.includes('by')) {
          curSide = 'by';
        }
        continue;
      }

      if (!title && !caseNo) continue;

      seq++;
      const statusRaw = this.getCell(vals, ci.update);
      const sl = statusRaw.toLowerCase();
      
      let status = 'Active';
      if (sl.includes('settled')) status = 'Settled';
      else if (sl.includes('stay')) status = 'Stayed';
      else if (sl.includes('favor')) status = 'Favorable';
      else if (sl.includes('adverse')) status = 'Adverse';
      else if (sl.includes('pend')) status = 'Pending';

      const claim = this.getCell(vals, ci.claim) || '-';
      let risk = 'Medium';
      if (!claim || claim === '-' || claim.toLowerCase() === 'nil') {
        risk = 'Low';
      } else if (claim.match(/[1-9]\d{7}/) || claim.includes(',00,000')) {
        risk = 'High';
      }

      const entity = this.detectEntity(title);
      const filedBy = `${curSide === 'against' ? 'Filed against' : 'Filed by'} ${entity}`;

      parsedCases.push({
        srNo: seq,
        group: 'Imported Cases',
        filedBy,
        nature: nature || 'General Proceeding',
        title: title || caseNo,
        caseNo: caseNo || '',
        court: this.getCell(vals, ci.court) || 'Unknown Court',
        counsel: this.getCell(vals, ci.counsel) || '-',
        entity,
        handler: 'HS',
        filed: '',
        ldoh: this.getCell(vals, ci.ldoh),
        ndoh: this.getCell(vals, ci.ndoh),
        update: statusRaw || 'Active',
        status,
        risk,
        actionRequired: this.getCell(vals, ci.action) || '',
        claim,
        bg: 'Imported via CSV Sync.',
      });
    }

    if (mode === 'replace') {
      // Full Replace: Soft delete all current records and load new ones
      await this.prisma.legalCase.updateMany({
        where: { deletedAt: null },
        data: {
          deletedAt: new Date(),
          deletedBy: userName,
        },
      });

      for (const c of parsedCases) {
        await this.prisma.legalCase.create({
          data: {
            ...c,
            timeline: [{ date: new Date().toISOString().split('T')[0], note: 'Case created via replacement CSV import.' }],
          },
        });
      }

      return { success: true, count: parsedCases.length, message: 'All litigation records replaced successfully' };
    }

    // Smart Sync: Match on normalized case numbers
    const existingCases = await this.prisma.legalCase.findMany({
      where: { deletedAt: null },
    });

    const index: Record<string, any> = {};
    existingCases.forEach(c => {
      if (c.caseNo) {
        index[this.normalizeCaseNo(c.caseNo)] = c;
      }
    });

    let updated = 0;
    let added = 0;
    let unchanged = 0;

    for (const p of parsedCases) {
      const key = this.normalizeCaseNo(p.caseNo);
      const ex = key ? index[key] : null;

      if (ex) {
        // Update mutable hearing history if different
        const changed =
          ex.ldoh !== p.ldoh ||
          ex.ndoh !== p.ndoh ||
          ex.update !== p.update ||
          ex.actionRequired !== p.actionRequired ||
          ex.status !== p.status ||
          ex.court !== p.court ||
          ex.claim !== p.claim;

        if (changed) {
          const timeline = Array.isArray(ex.timeline) ? ex.timeline : [];
          timeline.push({
            date: new Date().toISOString().split('T')[0],
            note: `Monthly Sync: Status updated. NDOH is ${p.ndoh || 'TBD'}.`,
          });

          await this.prisma.legalCase.update({
            where: { id: ex.id },
            data: {
              ldoh: p.ldoh || ex.ldoh,
              ndoh: p.ndoh || ex.ndoh,
              update: p.update || ex.update,
              actionRequired: p.actionRequired || ex.actionRequired,
              status: p.status || ex.status,
              court: p.court || ex.court,
              claim: p.claim !== '-' ? p.claim : ex.claim,
              timeline,
            },
          });
          updated++;
        } else {
          unchanged++;
        }
      } else {
        // Create new
        await this.prisma.legalCase.create({
          data: {
            ...p,
            timeline: [{ date: new Date().toISOString().split('T')[0], note: 'Case added via Smart Sync.' }],
          },
        });
        added++;
      }
    }

    return {
      success: true,
      updated,
      added,
      unchanged,
      message: `Smart Sync complete. ${updated} updated, ${added} new cases added, ${unchanged} unchanged.`,
    };
  }

  async remove(id: string, userId: string, userName: string) {
    await this.findOne(id);

    return this.prisma.legalCase.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userName,
      },
    });
  }

  // -------------------------------------------------------------------------
  // PRIVATE CSV PARSER HELPERS
  // -------------------------------------------------------------------------

  private parseCsvLine(line: string): string[] {
    const res: string[] = [];
    let cur = '';
    let inQ = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQ = !inQ;
      } else if (c === ',' && !inQ) {
        res.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    res.push(cur.trim());
    return res;
  }

  private getCell(row: string[], index: number): string {
    return index >= 0 && index < row.length ? row[index] : '';
  }

  private normalizeCaseNo(s: string): string {
    return String(s || '')
      .toUpperCase()
      .split('FILED ON')[0]
      .replace(/\(O&M\)/g, '')
      .replace(/[\s\xa0().-]/g, '')
      .trim();
  }

  private detectEntity(title: string): string {
    const t = String(title || '').toUpperCase();
    if (t.includes('HIPL')) return 'HIPL';
    if (t.includes('HPPL')) return 'HPPL';
    if (t.includes('SOLAR')) return 'HARTEK Solar';
    return 'HPPL'; // Default corporate entity
  }
}
