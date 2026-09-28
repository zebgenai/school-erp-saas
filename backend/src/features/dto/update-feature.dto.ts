import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateFeatureGlobalDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isGloballyEnabled: boolean;
}

export class UpdateSchoolFeatureDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isEnabled: boolean;
}
