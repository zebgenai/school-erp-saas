import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateRouteDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsNotEmpty()
  @IsString()
  startPoint: string;

  @IsNotEmpty()
  @IsString()
  endPoint: string;

  @IsOptional()
  @IsString()
  stops?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fare?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
