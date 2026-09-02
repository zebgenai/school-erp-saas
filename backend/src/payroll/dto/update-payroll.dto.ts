import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePayrollDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  basicSalary?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  allowances?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deductions?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  notes?: string;
}
