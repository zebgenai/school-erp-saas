import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class TeacherAttendanceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Required for SUPER_ADMIN only' })
  @IsOptional()
  @IsString()
  schoolId?: string;

  @ApiPropertyOptional({
    example: '2026-09-26',
    description: 'School-local work date (YYYY-MM-DD). Defaults to today in the school timezone when omitted.',
  })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: 'Alias for date (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  workDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  teacherId?: string;
}
