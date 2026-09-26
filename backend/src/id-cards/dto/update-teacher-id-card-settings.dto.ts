import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * PATCH body for teacher ID card design colors.
 * Omit a field to leave it unchanged; send null / empty to clear back to defaults.
 */
export class UpdateTeacherIdCardSettingsDto {
  @ApiPropertyOptional({ example: '#115e59', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsString()
  @Matches(HEX, { message: 'primaryColor must be a HEX color (#RGB or #RRGGBB)' })
  primaryColor?: string | null;

  @ApiPropertyOptional({ example: '#2dd4bf', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsString()
  @Matches(HEX, { message: 'accentColor must be a HEX color (#RGB or #RRGGBB)' })
  accentColor?: string | null;

  @ApiPropertyOptional({ example: '#ffffff', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsString()
  @Matches(HEX, { message: 'backgroundColor must be a HEX color (#RGB or #RRGGBB)' })
  backgroundColor?: string | null;

  @ApiPropertyOptional({ example: '#134e4a', nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsString()
  @Matches(HEX, { message: 'textColor must be a HEX color (#RGB or #RRGGBB)' })
  textColor?: string | null;

  /** SUPER_ADMIN only — target school. Ignored for SCHOOL_ADMIN. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  schoolId?: string;
}
