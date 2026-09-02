import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateExamSubjectDto {
  @ApiProperty({ example: 'subject-uuid' })
  @IsString()
  @IsNotEmpty()
  subjectId: string;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalMarks: number;

  @ApiProperty({ example: 33 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  passingMarks: number;
}
