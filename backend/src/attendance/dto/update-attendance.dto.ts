import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateAttendanceDto {
  @ApiProperty({ enum: AttendanceStatus, example: AttendanceStatus.ABSENT })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiPropertyOptional({ example: 'Sick leave' })
  @IsOptional()
  @IsString()
  remarks?: string;
}
