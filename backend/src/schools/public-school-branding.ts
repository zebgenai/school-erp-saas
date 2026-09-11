import { NotFoundException } from '@nestjs/common';
import { SchoolStatus } from '@prisma/client';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PublicSchoolBranding = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  theme: string | null;
};

export function isValidPublicSchoolSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && slug.length >= 2 && slug.length <= 80;
}

/** On a school Host, only that school's public branding may be requested. */
export function assertPublicSlugMatchesTenant(
  slug: string,
  tenantSlug?: string | null,
): void {
  if (tenantSlug && tenantSlug !== slug) {
    throw new NotFoundException('School not found');
  }
}

export function toPublicSchoolBranding(school: {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  themeColor?: string | null;
  status: SchoolStatus;
}): PublicSchoolBranding | null {
  if (school.status !== SchoolStatus.ACTIVE) return null;
  const logo =
    school.logoUrl && /^https?:\/\//i.test(school.logoUrl)
      ? school.logoUrl
      : school.logoUrl
        ? `/api/public/schools/${school.slug}/logo`
        : null;
  return {
    id: school.id,
    name: school.name,
    slug: school.slug,
    logo,
    theme: school.themeColor ?? null,
  };
}
