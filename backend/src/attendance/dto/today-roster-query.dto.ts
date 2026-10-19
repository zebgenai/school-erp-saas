import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const TODAY_ROSTER_CATEGORIES = ['PRESENT', 'ABSENT', 'LEAVE', 'LATE', 'NOT_MARKED'] as const;
export type TodayRosterCategory = (typeof TODAY_ROSTER_CATEGORIES)[number];

export class TodayRosterQueryDto extends PaginationQueryDto {
  @ApiProperty({ enum: TODAY_ROSTER_CATEGORIES })
  @IsIn(TODAY_ROSTER_CATEGORIES)
  category!: TodayRosterCategory;

  @ApiPropertyOptional({ description: 'Ignored for school users. A different school is rejected.' })
  @IsOptional()
  @IsString()
  schoolId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Matches student name or admission number' })
  @IsOptional()
  @IsString()
  search?: string;
}
