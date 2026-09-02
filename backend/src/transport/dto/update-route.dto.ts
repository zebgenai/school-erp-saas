import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateRouteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  startPoint?: string;

  @IsOptional()
  @IsString()
  endPoint?: string;

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
