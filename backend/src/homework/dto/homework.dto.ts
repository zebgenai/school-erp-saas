import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  HomeworkGradingType,
  HomeworkPriority,
  HomeworkStatus,
} from '@prisma/client';

export class CreateHomeworkDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsUUID()
  classId!: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsString()
  academicSession?: string;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(HomeworkPriority)
  priority?: HomeworkPriority;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number;

  @IsOptional()
  @IsEnum(HomeworkStatus)
  status?: HomeworkStatus;

  @IsOptional()
  @IsEnum(HomeworkGradingType)
  gradingType?: HomeworkGradingType;

  @IsOptional()
  @IsNumber()
  maxMarks?: number;

  @IsOptional()
  @IsBoolean()
  allowResubmit?: boolean;

  @IsOptional()
  @IsObject()
  rubric?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @IsOptional()
  @IsUUID()
  onlineClassId?: string;
}

export class UpdateHomeworkDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string | null;

  @IsOptional()
  @IsUUID()
  teacherId?: string | null;

  @IsOptional()
  @IsString()
  academicSession?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  instructions?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(HomeworkPriority)
  priority?: HomeworkPriority;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedMinutes?: number | null;

  @IsOptional()
  @IsEnum(HomeworkStatus)
  status?: HomeworkStatus;

  @IsOptional()
  @IsEnum(HomeworkGradingType)
  gradingType?: HomeworkGradingType;

  @IsOptional()
  @IsNumber()
  maxMarks?: number | null;

  @IsOptional()
  @IsBoolean()
  allowResubmit?: boolean;

  @IsOptional()
  @IsObject()
  rubric?: Record<string, unknown> | null;
}

export class SubmitHomeworkDto {
  @IsOptional()
  @IsString()
  comments?: string;
}

export class GradeHomeworkDto {
  @IsOptional()
  @IsNumber()
  marksObtained?: number;

  @IsOptional()
  @IsNumber()
  percentage?: number;

  @IsOptional()
  @IsString()
  gradeLabel?: string;

  @IsOptional()
  @IsString()
  passFail?: string;

  @IsOptional()
  @IsObject()
  rubricScores?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  teacherRemarks?: string;

  @IsOptional()
  @IsBoolean()
  markComplete?: boolean;
}

export class ReturnHomeworkDto {
  @IsOptional()
  @IsString()
  teacherRemarks?: string;
}
