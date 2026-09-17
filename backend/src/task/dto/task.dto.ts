import { IsString, IsNotEmpty, IsOptional, IsEnum, IsUUID, IsArray } from 'class-validator';

export enum TaskPriority {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export enum TaskStatus {
  OPEN = 'Open',
  IN_PROGRESS = 'In Progress',
  DONE = 'Done',
  CLOSED = 'Closed',
}

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty({ message: 'Task title is required' })
  title: string;

  @IsOptional()
  @IsString()
  detail?: string;

  @IsArray({ message: 'Assignees must be an array of user UUIDs' })
  @IsNotEmpty({ message: 'At least one assignee is required' })
  assigneeIds: string[];

  @IsEnum(TaskPriority, { message: 'Invalid priority value' })
  @IsNotEmpty({ message: 'Priority is required' })
  pri: string;

  @IsOptional()
  @IsString()
  due?: string; // "YYYY-MM-DD"

  @IsEnum(TaskStatus, { message: 'Invalid status value' })
  @IsNotEmpty({ message: 'Status is required' })
  st: string;

  @IsOptional()
  @IsString()
  cd?: string; // "YYYY-MM-DD" completion date

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateTaskDto {
  @IsString()
  @IsNotEmpty({ message: 'Task title is required' })
  title: string;

  @IsOptional()
  @IsString()
  detail?: string;

  @IsEnum(TaskPriority, { message: 'Invalid priority value' })
  @IsNotEmpty({ message: 'Priority is required' })
  pri: string;

  @IsOptional()
  @IsString()
  due?: string;

  @IsEnum(TaskStatus, { message: 'Invalid status value' })
  @IsNotEmpty({ message: 'Status is required' })
  st: string;

  @IsOptional()
  @IsString()
  cd?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateTaskProgressDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  cd?: string;
}
