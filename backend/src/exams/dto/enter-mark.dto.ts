import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class EnterMarkDto {
  @ApiProperty({ example: 'exam-uuid' })
  @IsString()
  @IsNotEmpty()
  examId: string;

  @ApiProperty({ example: 'student-uuid' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ example: 'subject-uuid' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ example: 85 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  obtainedMarks: number;

  @ApiPropertyOptional({ example: 'Good' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
