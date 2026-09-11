import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { SchoolStatus } from '@prisma/client';
import {
  assertPublicSlugMatchesTenant,
  isValidPublicSchoolSlug,
  toPublicSchoolBranding,
} from './public-school-branding';

describe('public school branding', () => {
  it('returns only safe public fields', () => {
    const branding = toPublicSchoolBranding({
      id: 'school-iqra',
      name: 'IQRA Smart School',
      slug: 'iqra-smart-school',
      logoUrl: '/uploads/logo.png',
      themeColor: '#2563eb',
      status: SchoolStatus.ACTIVE,
    });
    assert.deepEqual(branding, {
      id: 'school-iqra',
      name: 'IQRA Smart School',
      slug: 'iqra-smart-school',
      logo: '/api/public/schools/iqra-smart-school/logo',
      theme: '#2563eb',
    });
    assert.equal('email' in (branding as object), false);
  });

  it('hides inactive schools', () => {
    assert.equal(
      toPublicSchoolBranding({
        id: 'x',
        name: 'Hidden',
        slug: 'hidden',
        logoUrl: null,
        themeColor: null,
        status: SchoolStatus.SUSPENDED,
      }),
      null,
    );
  });

  it('does not leak another school slug on a tenant host', () => {
    assert.throws(
      () => assertPublicSlugMatchesTenant('iqra-smart-school', 'city-school'),
      (err: unknown) => err instanceof NotFoundException,
    );
    assert.doesNotThrow(() => assertPublicSlugMatchesTenant('iqra-smart-school', 'iqra-smart-school'));
    assert.doesNotThrow(() => assertPublicSlugMatchesTenant('iqra-smart-school', null));
  });

  it('rejects invalid slugs', () => {
    assert.equal(isValidPublicSchoolSlug('iqra-smart-school'), true);
    assert.equal(isValidPublicSchoolSlug('../secret'), false);
    assert.equal(isValidPublicSchoolSlug('admin'), true);
  });
});
