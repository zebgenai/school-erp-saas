import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}

export function resolvePagination(query: { limit?: number; skip?: number }) {
  const limit = query.limit ?? 50;
  const skip = query.skip ?? 0;
  return { take: limit, skip };
}
