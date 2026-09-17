import { IsString, IsNotEmpty, IsOptional, IsEnum, IsArray } from 'class-validator';

export enum FollowUpPriority {
  CRITICAL = 'Critical',
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export enum FollowUpStatus {
  OPEN = 'Open',
  IN_PROGRESS = 'In Progress',
  DONE = 'Done',
  CLOSED = 'Closed',
}

export class CreateFollowUpDto {
  @IsEnum(FollowUpPriority, { message: 'Invalid priority value' })
  @IsNotEmpty({ message: 'Priority is required' })
  priority: string;

  @IsOptional()
  @IsString()
  bu?: string;

  @IsOptional()
  @IsString()
  hd?: string;

  @IsString()
  @IsNotEmpty({ message: 'Project or Subject is required' })
  proj: string;

  @IsOptional()
  @IsString()
  with?: string;

  @IsOptional()
  @IsString()
  dl?: string; // "YYYY-MM-DD" Deadline

  @IsOptional()
  @IsString()
  desc?: string;

  @IsEnum(FollowUpStatus, { message: 'Invalid status value' })
  @IsNotEmpty({ message: 'Status is required' })
  st: string;

  @IsOptional()
  @IsArray({ message: 'Delegations must be an array of strings' })
  assignedTo?: string[];
}

export class UpdateFollowUpDto extends CreateFollowUpDto {}
