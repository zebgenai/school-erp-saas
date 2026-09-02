import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateGradeDto {
  @ApiProperty({ example: 'A+' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 90 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minPercent: number;

  @ApiProperty({ example: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  maxPercent: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;

  @ApiPropertyOptional({ description: 'Required for SUPER_ADMIN only' })
  @IsOptional()
  @IsString()
  schoolId?: string;
}
