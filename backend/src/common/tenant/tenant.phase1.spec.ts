import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SchoolStatus, UserRole } from '@prisma/client';
import {
  allocateUniqueSchoolSlug,
  schoolTenantDomain,
  slugifySchoolName,
} from './school-slug';
import { classifyHostname, normalizeHostHeader } from './tenant-host';
import { assertRequestTenantIsolation, assertTenantIsolation } from './tenant-isolation';
import { isTenantLoginRejected } from './tenant-login';
import { TenantResolverService } from './tenant.service';
import type { TenantSchool } from './tenant.types';

const IQRA: TenantSchool = {
  id: 'school-iqra',
  name: 'IQRA Smart School',
  slug: 'iqra-smart-school',
  domain: 'iqra-smart-school.clevercampus.cloud',
  status: SchoolStatus.ACTIVE,
};

const CITY: TenantSchool = {
  id: 'school-city',
  name: 'City School',
  slug: 'city-school',
  domain: 'city-school.clevercampus.cloud',
  status: SchoolStatus.ACTIVE,
};

const iqraAdmin = {
  id: 'user-iqra',
  email: 'admin@iqra.com',
  name: 'IQRA Admin',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: IQRA.id,
};

const superAdmin = {
  id: 'user-super',
  email: 'super@clevercampus.cloud',
  name: 'Super Admin',
  role: UserRole.SUPER_ADMIN,
  schoolId: null as string | null,
};

describe('Phase 1 school slugs', () => {
  it('slugifies school names without a timestamp', () => {
    assert.equal(slugifySchoolName('IQRA Smart School'), 'iqra-smart-school');
    assert.equal(slugifySchoolName('  City School  '), 'city-school');
    assert.equal(schoolTenantDomain('iqra-smart-school'), 'iqra-smart-school.clevercampus.cloud');
  });

  it('allocates -2, -3 when the base slug is taken', async () => {
    const taken = new Set(['iqra-smart-school', 'iqra-smart-school-2']);
    const slug = await allocateUniqueSchoolSlug('IQRA Smart School', async (candidate) =>
      taken.has(candidate),
    );
    assert.equal(slug, 'iqra-smart-school-3');
  });

  it('skips reserved subdomain labels', async () => {
    const slug = await allocateUniqueSchoolSlug('Admin', async () => false);
    assert.equal(slug, 'admin-2');
  });
});

describe('Phase 1 host tenant resolution', () => {
  it('A. iqra-smart-school.clevercampus.cloud resolves to IQRA', async () => {
    const host = 'iqra-smart-school.clevercampus.cloud';
    assert.deepEqual(classifyHostname(host), { kind: 'school', slug: 'iqra-smart-school' });
    assert.deepEqual(classifyHostname(`${host}:443`), { kind: 'school', slug: 'iqra-smart-school' });

    const prisma = {
      school: {
        findUnique: async ({ where }: { where: { slug: string } }) =>
          where.slug === IQRA.slug ? IQRA : null,
      },
    };
    const resolver = new TenantResolverService(prisma as any);
    const school = await resolver.resolveFromHost(host);
    assert.equal(school?.id, IQRA.id);
    assert.equal(school?.slug, 'iqra-smart-school');
  });

  it('B. unknown-school.clevercampus.cloud returns 404', async () => {
    assert.deepEqual(classifyHostname('unknown-school.clevercampus.cloud'), {
      kind: 'school',
      slug: 'unknown-school',
    });

    const prisma = {
      school: {
        findUnique: async () => null,
      },
    };
    const resolver = new TenantResolverService(prisma as any);
    await assert.rejects(
      () => resolver.resolveFromHost('unknown-school.clevercampus.cloud'),
      (err: unknown) => {
        assert.ok(err instanceof NotFoundException);
        assert.equal(err.getStatus(), 404);
        return true;
      },
    );
  });

  it('C. admin.clevercampus.cloud is platform / no school tenant', async () => {
    assert.deepEqual(classifyHostname('admin.clevercampus.cloud'), { kind: 'platform' });
    assert.deepEqual(classifyHostname('www.clevercampus.cloud'), { kind: 'platform' });
    assert.deepEqual(classifyHostname('api.clevercampus.cloud'), { kind: 'platform' });
    assert.deepEqual(classifyHostname('app.clevercampus.cloud'), { kind: 'platform' });
    assert.deepEqual(classifyHostname('mail.clevercampus.cloud'), { kind: 'platform' });
    assert.deepEqual(classifyHostname('clevercampus.cloud'), { kind: 'platform' });

    const resolver = new TenantResolverService({ school: { findUnique: async () => IQRA } } as any);
    assert.equal(await resolver.resolveFromHost('admin.clevercampus.cloud'), null);
    assert.equal(await resolver.resolveFromHost('clevercampus.cloud'), null);
  });

  it('strips port and lowercases the Host header', () => {
    assert.equal(normalizeHostHeader('IQRA-Smart-School.CleverCampus.Cloud:443'), 'iqra-smart-school.clevercampus.cloud');
  });
});

describe('Phase 1 tenant isolation', () => {
  it('D. IQRA user on IQRA host succeeds', () => {
    assert.doesNotThrow(() => assertTenantIsolation(iqraAdmin, IQRA));
  });

  it('E. IQRA user JWT on another school host returns 403', () => {
    assert.throws(
      () => assertTenantIsolation(iqraAdmin, CITY),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        assert.equal(err.getStatus(), 403);
        return true;
      },
    );
  });

  it('F. school user cannot override tenant using body schoolId', () => {
    assert.throws(
      () =>
        assertRequestTenantIsolation({
          user: iqraAdmin,
          tenantSchool: IQRA,
          body: { schoolId: CITY.id },
        }),
      (err: unknown) => {
        assert.ok(err instanceof ForbiddenException);
        assert.equal(err.getStatus(), 403);
        return true;
      },
    );
  });

  it('H. SUPER_ADMIN keeps platform override on a school host', () => {
    assert.doesNotThrow(() =>
      assertRequestTenantIsolation({
        user: superAdmin,
        tenantSchool: CITY,
        body: { schoolId: IQRA.id },
      }),
    );
  });
});

describe('Phase 1 login tenant scoping', () => {
  it('G. localhost / no tenant does not change login lookup', () => {
    assert.equal(classifyHostname('localhost:3000').kind, 'none');
    assert.equal(classifyHostname('127.0.0.1').kind, 'none');
    assert.equal(classifyHostname('iqra.localhost').kind, 'none');
    assert.equal(isTenantLoginRejected(iqraAdmin, null), false);
    assert.equal(isTenantLoginRejected(iqraAdmin, undefined), false);
    assert.equal(isTenantLoginRejected(superAdmin, null), false);
  });

  it('school subdomain login is scoped to that school', () => {
    assert.equal(isTenantLoginRejected(iqraAdmin, IQRA.id), false);
    assert.equal(isTenantLoginRejected(iqraAdmin, CITY.id), true);
    assert.equal(isTenantLoginRejected(superAdmin, IQRA.id), true);
    assert.equal(isTenantLoginRejected(null, IQRA.id), true);
  });
});
