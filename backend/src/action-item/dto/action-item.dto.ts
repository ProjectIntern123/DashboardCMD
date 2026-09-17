import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID, IsArray } from 'class-validator';

export enum ActionItemPriority {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export enum ActionItemStatus {
  OPEN = 'Open',
  IN_PROGRESS = 'In Progress',
  DONE = 'Done',
  CLOSED = 'Closed',
}

export class CreateActionItemDto {
  @IsOptional()
  @IsUUID('4', { message: 'Meeting ID must be a valid UUID' })
  meetingId?: string;

  @IsOptional()
  @IsString()
  meetingName?: string;

  @IsOptional()
  @IsString()
  meetingDate?: string;

  @IsOptional()
  @IsString()
  meetingType?: string;

  @IsString()
  @IsNotEmpty({ message: 'Action item description is required' })
  item: string;

  @IsString()
  @IsNotEmpty({ message: 'Owner name is required' })
  own: string;

  @IsOptional()
  @IsString()
  dept?: string;

  @IsEnum(ActionItemPriority, { message: 'Invalid priority value' })
  @IsNotEmpty({ message: 'Priority is required' })
  pri: string;

  @IsOptional()
  @IsString()
  due?: string; // "YYYY-MM-DD"

  @IsEnum(ActionItemStatus, { message: 'Invalid status value' })
  @IsNotEmpty({ message: 'Status is required' })
  st: string;

  @IsOptional()
  @IsString()
  cd?: string; // "YYYY-MM-DD"

  @IsOptional()
  @IsString()
  rem?: string;

  @IsOptional()
  @IsString()
  recur?: string;

  @IsOptional()
  @IsString()
  dep?: string;

  @IsOptional()
  @IsArray({ message: 'Delegations must be an array of strings' })
  assignedTo?: string[];
}

export class UpdateActionItemDto extends CreateActionItemDto {}
