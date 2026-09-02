import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, Min } from 'class-validator';

export class ReturnBookDto {
  @IsOptional()
  @IsDateString()
  returnDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fine?: number;

  @IsOptional()
  @IsBoolean()
  finePaid?: boolean;

  @IsOptional()
  @IsBoolean()
  isLost?: boolean;
}
