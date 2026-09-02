import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { PlatformSettingsService } from './platform-settings.service';

class SettingItemDto {
  @IsString() key: string;
  @IsString() value: string;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() category?: string;
}

class UpsertSettingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettingItemDto)
  settings: SettingItemDto[];
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('platform-settings')
export class PlatformSettingsController {
  constructor(private readonly service: PlatformSettingsService) {}

  @Roles(UserRole.SUPER_ADMIN)
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Patch()
  upsertMany(@Body() dto: UpsertSettingsDto) {
    return this.service.upsertMany(dto.settings);
  }
}
