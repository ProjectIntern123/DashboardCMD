import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, IsUUID, IsDateString, Min, Max } from 'class-validator';

export enum ProjectStage {
  PLANNING = 'Planning',
  EXECUTION = 'Execution',
  COMMISSIONING = 'Commissioning',
  COMPLETED = 'Completed',
  ON_HOLD = 'On Hold',
}

export enum ProjectHealth {
  GREEN = 'Green',
  AMBER = 'Amber',
  RED = 'Red',
}

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty({ message: 'Project name is required' })
  name: string;

  @IsNotEmpty({ message: 'Business Unit is required' })
  @IsUUID('4', { message: 'Business Unit ID must be a valid UUID' })
  buId: string;

  @IsOptional()
  @IsString()
  client?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  pm?: string;

  @IsEnum(ProjectStage, { message: 'Invalid project stage value' })
  @IsNotEmpty({ message: 'Project stage is required' })
  stage: string;

  @IsEnum(ProjectHealth, { message: 'Invalid project health (RAG) value' })
  @IsNotEmpty({ message: 'Project health is required' })
  health: string;

  @IsOptional()
  @IsNumber({}, { message: 'Order value must be a number' })
  order?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Order date must be a valid ISO date string' })
  odate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Scheduled COD must be a valid ISO date string' })
  cod?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Revised COD must be a valid ISO date string' })
  rcod?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Progress must be a number' })
  @Min(0)
  @Max(100)
  prog?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Billed amount must be a number' })
  billed?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Collected amount must be a number' })
  collected?: number;

  @IsOptional()
  @IsString()
  milestone?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Milestone target date must be a valid ISO date string' })
  mdate?: string;

  @IsOptional()
  @IsString()
  risks?: string;

  @IsOptional()
  @IsString()
  rem?: string;
}

export class UpdateProjectDto extends CreateProjectDto {}
