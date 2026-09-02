import { IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateNoticeDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  type?: string; // NOTICE | ANNOUNCEMENT | EVENT

  @IsOptional()
  @IsString()
  targetRoles?: string; // comma-separated: TEACHER,PARENT,STUDENT or ALL

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsString()
  attachmentUrl?: string;
}
