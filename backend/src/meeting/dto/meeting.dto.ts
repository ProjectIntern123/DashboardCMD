import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';

export enum MeetingCategory {
  CMD = 'cmd',
  BOARD = 'board',
  REVIEW = 'review',
  VENDOR = 'vendor',
  SAFETY = 'safety',
  OTHER = 'other',
}

export enum MeetingStatus {
  SCHEDULED = 'scheduled',
  CONDUCTED = 'done',
  CANCELLED = 'cancelled',
}

export class CreateMeetingDto {
  @IsString()
  @IsNotEmpty({ message: 'Meeting name is required' })
  name: string;

  @IsEnum(MeetingCategory, { message: 'Invalid category value' })
  @IsNotEmpty({ message: 'Meeting category is required' })
  cat: string;

  @IsEnum(MeetingStatus, { message: 'Invalid status value' })
  @IsNotEmpty({ message: 'Meeting status is required' })
  status: string;

  @IsOptional()
  @IsString()
  agenda?: string;

  @IsOptional()
  @IsString()
  attendees?: string;

  @IsString()
  @IsNotEmpty({ message: 'Date is required (YYYY-MM-DD)' })
  date: string;

  @IsOptional()
  @IsString()
  time?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsString()
  recur?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  notepad?: string;
}

export class UpdateMeetingDto extends CreateMeetingDto {}

export class UpdateNotesDto {
  @IsString()
  @IsNotEmpty({ message: 'Notepad notes content is required' })
  notes: string;
}
