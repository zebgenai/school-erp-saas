import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class BulkMarkRecordDto {
  @ApiProperty({ example: 'student-uuid' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

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

export class BulkMarksDto {
  @ApiProperty({ example: 'exam-uuid' })
  @IsString()
  @IsNotEmpty()
  examId: string;

  @ApiProperty({ example: 'subject-uuid' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ type: [BulkMarkRecordDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkMarkRecordDto)
  records: BulkMarkRecordDto[];
}
