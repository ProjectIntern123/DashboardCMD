import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, IsArray, IsJSON } from 'class-validator';

export enum LegalCaseStatus {
  ACTIVE = 'Active',
  FAVORABLE = 'Favorable',
  ADVERSE = 'Adverse',
  PENDING = 'Pending',
  STAYED = 'Stayed',
  SETTLED = 'Settled',
}

export enum LegalCaseRisk {
  HIGH = 'High',
  MEDIUM = 'Medium',
  LOW = 'Low',
}

export class CreateLegalCaseDto {
  @IsOptional()
  @IsNumber({}, { message: 'Sr No must be a number' })
  srNo?: number;

  @IsString()
  @IsNotEmpty({ message: 'Section group is required' })
  group: string;

  @IsString()
  @IsNotEmpty({ message: 'Filed by/against Hartek is required' })
  filedBy: string;

  @IsOptional()
  @IsString()
  nature?: string;

  @IsString()
  @IsNotEmpty({ message: 'Case title (Party A vs Party B) is required' })
  title: string;

  @IsOptional()
  @IsString()
  caseNo?: string;

  @IsString()
  @IsNotEmpty({ message: 'Court name is required' })
  court: string;

  @IsOptional()
  @IsString()
  counsel?: string;

  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString()
  handler?: string;

  @IsOptional()
  @IsString()
  filed?: string; // "YYYY-MM-DD"

  @IsOptional()
  @IsString()
  ldoh?: string; // "YYYY-MM-DD"

  @IsOptional()
  @IsString()
  ndoh?: string; // date string or description

  @IsOptional()
  @IsString()
  update?: string; // Case status / listed for

  @IsEnum(LegalCaseStatus, { message: 'Invalid status value' })
  @IsNotEmpty({ message: 'Status is required' })
  status: string;

  @IsEnum(LegalCaseRisk, { message: 'Invalid risk value' })
  @IsNotEmpty({ message: 'Risk level is required' })
  risk: string;

  @IsOptional()
  @IsString()
  actionRequired?: string;

  @IsOptional()
  @IsString()
  claim?: string;

  @IsOptional()
  @IsString()
  bg?: string;

  @IsOptional()
  @IsString()
  timeline?: string; // Stored as serialized JSON array of {date, note}
}

export class UpdateLegalCaseDto extends CreateLegalCaseDto {}
