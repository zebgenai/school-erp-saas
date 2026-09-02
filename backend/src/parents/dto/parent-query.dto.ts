import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ParentQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  /** Registration month (1-12). Combined with `year` when both are supplied. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Month must be a whole number' })
  @Min(1, { message: 'Month must be between 1 and 12' })
  @Max(12, { message: 'Month must be between 1 and 12' })
  month?: number;

  /** Registration year. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Year must be a whole number' })
  @Min(1970, { message: 'Year must be 1970 or later' })
  @Max(2200, { message: 'Year must be 2200 or earlier' })
  year?: number;
}
