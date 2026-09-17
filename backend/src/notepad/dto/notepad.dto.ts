import { IsString, IsNotEmpty, IsOptional, IsJSON } from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty({ message: 'Note title is required' })
  title: string;

  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  images?: string; // Serialized JSON array of {id, name, data}
}

export class UpdateNoteDto extends CreateNoteDto {}
