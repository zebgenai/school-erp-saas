import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  MeetingProvider,
  OnlineAttendanceStatus,
  OnlineClassStatus,
} from '@prisma/client';

export class CreateOnlineClassDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsUUID()
  classId!: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsEnum(MeetingProvider)
  provider!: MeetingProvider;

  @IsOptional()
  @IsString()
  meetingLink?: string;

  @IsOptional()
  @IsString()
  meetingId?: string;

  @IsOptional()
  @IsString()
  passcode?: string;

  @IsDateString()
  scheduledDate!: string;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(OnlineClassStatus)
  status?: OnlineClassStatus;

  @IsOptional()
  @IsUUID()
  schoolId?: string;
}

export class UpdateOnlineClassDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string | null;

  @IsOptional()
  @IsUUID()
  teacherId?: string | null;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsOptional()
  @IsUUID()
  sectionId?: string | null;

  @IsOptional()
  @IsEnum(MeetingProvider)
  provider?: MeetingProvider;

  @IsOptional()
  @IsString()
  meetingLink?: string | null;

  @IsOptional()
  @IsString()
  meetingId?: string | null;

  @IsOptional()
  @IsString()
  passcode?: string | null;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsEnum(OnlineClassStatus)
  status?: OnlineClassStatus;

  @IsOptional()
  @IsString()
  recordingUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  recordingDurationSec?: number | null;

  @IsOptional()
  @IsNumber()
  recordingSizeBytes?: number | null;
}

export class AttendanceItemDto {
  @IsUUID()
  studentId!: string;

  @IsEnum(OnlineAttendanceStatus)
  status!: OnlineAttendanceStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class MarkAttendanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendanceItemDto)
  items!: AttendanceItemDto[];
}

export class LinkHomeworkDto {
  @IsUUID()
  homeworkId!: string;
}
