import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount: number;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;

  @IsOptional()
  @IsString()
  schoolId?: string;
}
