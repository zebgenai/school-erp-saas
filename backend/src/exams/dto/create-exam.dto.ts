import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExamStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateExamDto {
  @ApiProperty({ example: 'Mid Term Exam' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'class-uuid' })
  @IsString()
  @IsNotEmpty()
  classId: string;

  @ApiPropertyOptional({ example: 'section-uuid' })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiPropertyOptional({ example: '2026-06-10' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-06-20' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ enum: ExamStatus, example: ExamStatus.DRAFT })
  @IsOptional()
  @IsEnum(ExamStatus)
  status?: ExamStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Required for SUPER_ADMIN only' })
  @IsOptional()
  @IsString()
  schoolId?: string;
}
