import { Controller, Get, NotFoundException, Param, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { SkipForcePassword } from '../common/decorators/skip-force-password.decorator';
import {
  assertPublicSlugMatchesTenant,
  isValidPublicSchoolSlug,
} from './public-school-branding';
import { SchoolsService } from './schools.service';

@SkipThrottle()
@SkipForcePassword()
@Controller('public/schools')
export class PublicSchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Get(':slug')
  getBranding(@Param('slug') slug: string, @Req() req: Request) {
    const normalized = String(slug || '').toLowerCase();
    if (!isValidPublicSchoolSlug(normalized)) {
      throw new NotFoundException('School not found');
    }
    assertPublicSlugMatchesTenant(normalized, req.tenantSchool?.slug);
    return this.schoolsService.findPublicBranding(normalized);
  }

  @Get(':slug/logo')
  getLogo(@Param('slug') slug: string, @Req() req: Request) {
    const normalized = String(slug || '').toLowerCase();
    if (!isValidPublicSchoolSlug(normalized)) {
      throw new NotFoundException('School not found');
    }
    assertPublicSlugMatchesTenant(normalized, req.tenantSchool?.slug);
    return this.schoolsService.streamPublicLogo(normalized);
  }
}
