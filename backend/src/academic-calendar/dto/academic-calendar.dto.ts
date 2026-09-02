import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  CalendarEventStatus,
  CalendarEventType,
  CalendarRecurrence,
} from '@prisma/client';

/** Audience tokens stored in AcademicCalendarEvent.visibility (comma separated). */
export const VISIBILITY_AUDIENCES = [
  'SCHOOL',
  'TEACHER',
  'STUDENT',
  'PARENT',
  'STAFF',
] as const;

export type VisibilityAudience = (typeof VISIBILITY_AUDIENCES)[number];

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateCalendarEventDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsEnum(CalendarEventType)
  eventType!: CalendarEventType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  academicSession?: string;

  @IsOptional()
  @IsUUID()
  schoolId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'startTime must be in HH:mm format' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'endTime must be in HH:mm format' })
  endTime?: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  colorLabel?: string;

  @IsOptional()
  @IsEnum(CalendarRecurrence)
  recurrence?: CalendarRecurrence;

  @IsOptional()
  @IsDateString()
  recurrenceUntil?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(VISIBILITY_AUDIENCES as unknown as string[], { each: true })
  visibility?: VisibilityAudience[];

  @IsOptional()
  @IsEnum(CalendarEventStatus)
  status?: CalendarEventStatus;
}

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(CalendarEventType)
  eventType?: CalendarEventType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  academicSession?: string | null;

  @IsOptional()
  @IsUUID()
  classId?: string | null;

  @IsOptional()
  @IsUUID()
  sectionId?: string | null;

  @IsOptional()
  @IsUUID()
  teacherId?: string | null;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'startTime must be in HH:mm format' })
  startTime?: string | null;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'endTime must be in HH:mm format' })
  endTime?: string | null;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  colorLabel?: string | null;

  @IsOptional()
  @IsEnum(CalendarRecurrence)
  recurrence?: CalendarRecurrence;

  @IsOptional()
  @IsDateString()
  recurrenceUntil?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(VISIBILITY_AUDIENCES as unknown as string[], { each: true })
  visibility?: VisibilityAudience[];

  @IsOptional()
  @IsEnum(CalendarEventStatus)
  status?: CalendarEventStatus;
}
