import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsDateString()
  joiningDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  salary?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  schoolId?: string;
}
