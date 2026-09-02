import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  OptionalNonNullRelationId,
  OptionalRelationId,
} from '../../common/decorators/id-validation.decorator';
import { TIME_PATTERN } from './create-timetable-entry.dto';

export class UpdateTimetableEntryDto {
  @OptionalNonNullRelationId('Class')
  classId?: string;

  @OptionalRelationId('Section')
  sectionId?: string | null;

  @OptionalRelationId('Subject')
  subjectId?: string | null;

  @OptionalRelationId('Teacher')
  teacherId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodNo?: number;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'Start time must be in 24-hour HH:MM format' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'End time must be in 24-hour HH:MM format' })
  endTime?: string;

  @IsOptional()
  @IsString()
  roomNo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
