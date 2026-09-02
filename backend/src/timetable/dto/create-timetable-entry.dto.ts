import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

import {
  OptionalRelationId,
  RequiredRelationId,
} from '../../common/decorators/id-validation.decorator';

/** 24-hour clock time, e.g. "08:00" or "14:45". */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateTimetableEntryDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @RequiredRelationId('Class')
  classId: string;

  @OptionalRelationId('Section')
  sectionId?: string | null;

  @OptionalRelationId('Subject')
  subjectId?: string | null;

  @OptionalRelationId('Teacher')
  teacherId?: string | null;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodNo: number;

  @IsNotEmpty()
  @Matches(TIME_PATTERN, { message: 'Start time must be in 24-hour HH:MM format' })
  startTime: string;

  @IsNotEmpty()
  @Matches(TIME_PATTERN, { message: 'End time must be in 24-hour HH:MM format' })
  endTime: string;

  @IsOptional()
  @IsString()
  roomNo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
