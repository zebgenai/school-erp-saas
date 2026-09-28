import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserDecorator } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/types/current-user.type';
import { UpdateFeatureGlobalDto, UpdateSchoolFeatureDto } from './dto/update-feature.dto';
import { FeaturesService } from './features.service';

@ApiTags('features')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('features')
export class FeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  @ApiOperation({ summary: 'List all features (Super Admin)' })
  @Roles(UserRole.SUPER_ADMIN)
  @Get()
  list() {
    return this.featuresService.listForAdmin();
  }

  @ApiOperation({ summary: 'Effective features for a school (Super Admin)' })
  @Roles(UserRole.SUPER_ADMIN)
  @Get('schools/:schoolId')
  schoolFeatures(@Param('schoolId') schoolId: string) {
    return this.featuresService.getSchoolFeatures(schoolId);
  }

  @ApiOperation({ summary: 'Feature detail with per-school overrides' })
  @Roles(UserRole.SUPER_ADMIN)
  @Get(':key')
  detail(@Param('key') key: string) {
    return this.featuresService.getFeatureDetail(key);
  }

  @ApiOperation({ summary: 'Set global feature ON/OFF (core cannot be disabled)' })
  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':key/global')
  setGlobal(
    @Param('key') key: string,
    @Body() dto: UpdateFeatureGlobalDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.featuresService.setGlobal(key, dto.isGloballyEnabled, user);
  }

  @ApiOperation({ summary: 'Set school override ON/OFF' })
  @Roles(UserRole.SUPER_ADMIN)
  @Patch(':key/schools/:schoolId')
  setSchool(
    @Param('key') key: string,
    @Param('schoolId') schoolId: string,
    @Body() dto: UpdateSchoolFeatureDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.featuresService.setSchoolOverride(key, schoolId, dto.isEnabled, user);
  }

  @ApiOperation({ summary: 'Reset school override to Inherit' })
  @Roles(UserRole.SUPER_ADMIN)
  @Delete(':key/schools/:schoolId')
  resetSchool(
    @Param('key') key: string,
    @Param('schoolId') schoolId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.featuresService.resetSchoolOverride(key, schoolId, user);
  }
}
