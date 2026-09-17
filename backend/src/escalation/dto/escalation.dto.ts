import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray } from 'class-validator';

export enum EscalationSeverity {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
}

export enum EscalationStatus {
  IN_PROGRESS = 'In Progress',
  ESCALATED = 'Escalated',
  RESOLVED = 'Resolved',
  CLOSED = 'Closed',
}

export class CreateEscalationDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  @IsNotEmpty({ message: 'Project name is required' })
  proj: string;

  @IsString()
  @IsNotEmpty({ message: 'Escalation type is required' })
  type: string;

  @IsEnum(EscalationSeverity, { message: 'Invalid severity value' })
  @IsNotEmpty({ message: 'Severity is required' })
  sev: string;

  @IsOptional()
  @IsString()
  desc?: string;

  @IsOptional()
  @IsString()
  by?: string;

  @IsOptional()
  @IsString()
  date?: string; // "YYYY-MM-DD"

  @IsOptional()
  @IsString()
  own?: string;

  @IsOptional()
  @IsString()
  esc?: string;

  @IsOptional()
  @IsString()
  tgt?: string;

  @IsEnum(EscalationStatus, { message: 'Invalid status value' })
  @IsNotEmpty({ message: 'Status is required' })
  st: string;

  @IsOptional()
  @IsString()
  res?: string;

  @IsOptional()
  @IsArray({ message: 'Delegations must be an array of strings' })
  assignedTo?: string[];
}

export class UpdateEscalationDto extends CreateEscalationDto {}
