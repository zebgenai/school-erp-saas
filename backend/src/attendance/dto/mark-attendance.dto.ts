import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MarkAttendanceDto {
  @ApiProperty({ example: 'student-uuid' })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ example: '2026-06-08' })
  @IsDateString()
  date: string;

  @ApiProperty({ enum: AttendanceStatus, example: AttendanceStatus.PRESENT })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiPropertyOptional({ example: 'On time' })
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({ description: 'Required for SUPER_ADMIN only' })
  @IsOptional()
  @IsString()
  schoolId?: string;
}
