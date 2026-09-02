import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateVehicleDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsNotEmpty()
  @IsString()
  vehicleNo: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity: number;

  @IsOptional()
  @IsString()
  driverName?: string;

  @IsOptional()
  @IsString()
  driverPhone?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
