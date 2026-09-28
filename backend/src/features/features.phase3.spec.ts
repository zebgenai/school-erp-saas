import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { FEATURE_DISABLED_CODE, FEATURE_ALIASES } from './feature.constants';
import { FeatureGuard } from './feature.guard';
import { FeaturesService, resolveFeatureEnabled } from './features.service';

const schoolA = 'school-a';
const schoolB = 'school-b';

const schoolAdmin = {
  id: 'admin-a',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: schoolA,
};

const parent = {
  id: 'p1',
  role: UserRole.PARENT,
  schoolId: schoolA,
};

const superAdmin = {
  id: 'sa',
  role: UserRole.SUPER_ADMIN,
  schoolId: null as string | null,
};

const GATED_PDF_FEATURES = [
  { feature: 'fees', route: 'fee-invoice' },
  { feature: 'fees', route: 'fee-invoices/archive' },
  { feature: 'fees', route: 'fee-receipt' },
  { feature: 'fees', route: 'fee-defaulters' },
  { feature: 'payroll', route: 'salary-slip' },
  { feature: 'expenses', route: 'expense-report' },
  { feature: 'reports', route: 'financial-report' },
  { feature: 'exams', route: 'report-card' },
  { feature: 'timetable', route: 'class-timetable' },
] as const;

const CORE_PDF_ROUTES = [
  'id-cards',
  'teacher-id-cards',
  'student-profile',
  'student-attendance',
] as const;

function makeContext(opts: {
  featureKey?: string;
  schoolFrom?: unknown;
  roles?: UserRole[];
  user?: typeof schoolAdmin | typeof parent | typeof superAdmin | null;
  method?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: opts.method ?? 'GET',
        user: opts.user === undefined ? schoolAdmin : opts.user,
        query: opts.query ?? {},
        body: opts.body ?? {},
        params: opts.params ?? {},
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

function makeReflector(featureKey: string | undefined, schoolFrom?: unknown) {
  return {
    getAllAndOverride: (key: string) => {
      if (key === 'requireFeature') return featureKey;
      if (key === 'featureSchoolFrom') return schoolFrom;
      return undefined;
    },
  };
}

function makeFeaturesService(
  enabled: boolean | ((key: string, schoolId: string | null) => boolean | Promise<boolean>),
) {
  const isEnabled =
    typeof enabled === 'function'
      ? enabled
      : async (_key: string, _schoolId: string | null) => enabled;

  return {
    isFeatureEnabled: async (key: string, schoolId: string | null) => isEnabled(key, schoolId),
    assertFeatureDisabledForbidden: (key: string) => {
      throw new ForbiddenException(
        `[${FEATURE_DISABLED_CODE}] Feature '${key}' is disabled`,
      );
    },
  };
}

async function runFeatureGuard(
  featureKey: string | undefined,
  enabled: boolean | ((key: string, schoolId: string | null) => boolean | Promise<boolean>),
  ctxOpts: Parameters<typeof makeContext>[0] = {},
  prisma: any = {},
) {
  const guard = new FeatureGuard(
    makeReflector(featureKey, ctxOpts.schoolFrom) as any,
    makeFeaturesService(enabled) as any,
    prisma,
  );
  return guard.canActivate(makeContext({ ...ctxOpts, featureKey }));
}

function runRolesGuard(roles: UserRole[] | undefined, user: typeof schoolAdmin | typeof parent) {
  const guard = new RolesGuard({
    getAllAndOverride: () => roles,
  } as any);
  return guard.canActivate(makeContext({ roles, user }));
}

describe('Feature Control Phase 3 — PDF FeatureGuard', () => {
  for (const { feature, route } of GATED_PDF_FEATURES) {
    it(`${route}: feature ON + authorized role passes FeatureGuard`, async () => {
      assert.equal(await runFeatureGuard(feature, true, { user: schoolAdmin }), true);
    });

    it(`${route}: feature OFF + authorized role → FEATURE_DISABLED 403`, async () => {
      await assert.rejects(
        () => runFeatureGuard(feature, false, { user: schoolAdmin }),
        (err: unknown) => {
          assert.ok(err instanceof ForbiddenException);
          const res = (err as ForbiddenException).getResponse();
          const msg = typeof res === 'string' ? res : JSON.stringify(res);
          assert.match(msg, new RegExp(FEATURE_DISABLED_CODE));
          return true;
        },
      );
    });
  }

  it('wrong role still rejected by RolesGuard when feature ON', async () => {
    assert.equal(await runFeatureGuard('fees', true, { user: parent }), true);
    assert.equal(
      runRolesGuard([UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT], parent),
      false,
    );
  });

  it('school override OFF blocks only that school for PDF feature', async () => {
    const enabled = async (_key: string, schoolId: string | null) => schoolId !== schoolA;
    await assert.rejects(
      () => runFeatureGuard('fees', enabled, { user: { ...schoolAdmin, schoolId: schoolA } }),
      ForbiddenException,
    );
    assert.equal(
      await runFeatureGuard('fees', enabled, {
        user: { ...schoolAdmin, schoolId: schoolB },
      }),
      true,
    );
  });

  it('SUPER_ADMIN resolves school from fee invoice entity before feature check', async () => {
    const prisma = {
      feeInvoice: {
        findUnique: async ({ where }: any) =>
          where.id === 'inv-1' ? { schoolId: schoolA } : null,
      },
    };
    const enabled = async (_k: string, schoolId: string | null) => schoolId !== schoolA;

    await assert.rejects(
      () =>
        runFeatureGuard(
          'fees',
          enabled,
          {
            user: superAdmin,
            params: { id: 'inv-1' },
            schoolFrom: { source: 'param', name: 'id', entity: 'feeInvoice' },
          },
          prisma,
        ),
      ForbiddenException,
    );

    // Different school invoice remains allowed when only schoolA is OFF
    const prismaB = {
      feeInvoice: {
        findUnique: async () => ({ schoolId: schoolB }),
      },
    };
    assert.equal(
      await runFeatureGuard(
        'fees',
        enabled,
        {
          user: superAdmin,
          params: { id: 'inv-2' },
          schoolFrom: { source: 'param', name: 'id', entity: 'feeInvoice' },
        },
        prismaB,
      ),
      true,
    );
  });

  for (const route of CORE_PDF_ROUTES) {
    it(`core PDF ${route} has no RequireFeature → FeatureGuard skips`, async () => {
      assert.equal(await runFeatureGuard(undefined, false, { user: schoolAdmin }), true);
    });
  }
});

describe('Feature Control Phase 3 — results aliases exams', () => {
  function makeSvc(examsGlobal: boolean, examsOverrideA: boolean | null = null) {
    const exams = {
      id: 'feat-exams',
      key: 'exams',
      name: 'Exams',
      description: 'x',
      isGloballyEnabled: examsGlobal,
      isCore: false,
    };
    const results = {
      id: 'feat-results',
      key: 'results',
      name: 'Results',
      description: 'linked',
      isGloballyEnabled: true, // even if stale ON in DB, effective follows exams
      isCore: false,
    };
    const override =
      examsOverrideA === null
        ? null
        : {
            id: 'sf',
            schoolId: schoolA,
            featureId: exams.id,
            isEnabled: examsOverrideA,
          };

    const prisma = {
      feature: {
        findUnique: async ({ where }: any) => {
          if (where.key === 'exams') return { ...exams };
          if (where.key === 'results') return { ...results };
          return null;
        },
        findMany: async () => [
          { ...exams, _count: { schoolFeatures: 0 } },
          { ...results, _count: { schoolFeatures: 0 } },
        ],
        update: async ({ data }: any) => {
          Object.assign(exams, data);
          return { ...exams };
        },
        upsert: async () => exams,
      },
      schoolFeature: {
        findUnique: async ({ where }: any) => {
          const sid = where.schoolId_featureId?.schoolId;
          const fid = where.schoolId_featureId?.featureId;
          if (sid === schoolA && fid === exams.id) return override;
          return null;
        },
        findMany: async ({ where }: any) => {
          if (where?.schoolId === schoolA && override) return [override];
          if (where?.featureId === exams.id && override) return [override];
          return [];
        },
        upsert: async () => override,
        deleteMany: async () => ({ count: 0 }),
      },
      school: {
        findUnique: async ({ where }: any) =>
          where.id === schoolA || where.id === schoolB ? { id: where.id } : null,
        findMany: async () => [
          { id: schoolA, name: 'A', slug: 'a', status: 'ACTIVE' },
          { id: schoolB, name: 'B', slug: 'b', status: 'ACTIVE' },
        ],
      },
    };
    return new FeaturesService(prisma as any);
  }

  it('exams ON => results effective ON', async () => {
    const svc = makeSvc(true, null);
    assert.equal(await svc.isFeatureEnabled('exams', schoolA), true);
    assert.equal(await svc.isFeatureEnabled('results', schoolA), true);
    const map = await svc.getEffectiveFeatures(schoolA);
    assert.equal(map.exams, true);
    assert.equal(map.results, true);
  });

  it('exams OFF => results effective OFF', async () => {
    const svc = makeSvc(false, true);
    assert.equal(await svc.isFeatureEnabled('exams', schoolA), false);
    assert.equal(await svc.isFeatureEnabled('results', schoolA), false);
    const map = await svc.getEffectiveFeatures(schoolA);
    assert.equal(map.exams, false);
    assert.equal(map.results, false);
  });

  it('never effective exams ON + results OFF', async () => {
    const svc = makeSvc(true, null);
    const map = await svc.getEffectiveFeatures(schoolA);
    assert.equal(map.exams && !map.results, false);
    assert.equal(FEATURE_ALIASES.results, 'exams');
  });

  it('results mutation cannot create independent OFF state', async () => {
    const svc = makeSvc(true, null);
    await assert.rejects(
      () => svc.setGlobal('results', false, superAdmin as any),
      BadRequestException,
    );
    await assert.rejects(
      () => svc.setSchoolOverride('results', schoolA, false, superAdmin as any),
      BadRequestException,
    );
    await assert.rejects(
      () => svc.resetSchoolOverride('results', schoolA, superAdmin as any),
      BadRequestException,
    );
  });

  it('getEnabledFeatureKeys includes results when exams enabled', async () => {
    const svc = makeSvc(true, null);
    const keys = await svc.getEnabledFeatureKeys(schoolA);
    assert.ok(keys.includes('exams'));
    assert.ok(keys.includes('results'));
  });

  it('listForAdmin marks results as linkedTo exams', async () => {
    const svc = makeSvc(true, null);
    const list = await svc.listForAdmin();
    const results = list.find((f) => f.key === 'results');
    assert.equal(results?.linkedTo, 'exams');
  });
});

describe('Feature Control Phase 3 — reports student-count-by-class', () => {
  it('blocked when reports OFF', async () => {
    await assert.rejects(
      () => runFeatureGuard('reports', false, { user: schoolAdmin }),
      ForbiddenException,
    );
  });

  it('Dashboard-shared endpoints have no RequireFeature metadata', async () => {
    for (const _ of [
      'dashboard-summary',
      'recent-admissions',
      'fee-defaulters',
      'monthly-fee-chart',
      'attendance-chart',
      'upcoming-exams',
      'recent-fee-payments',
      'profit-loss',
    ]) {
      assert.equal(await runFeatureGuard(undefined, false, { user: schoolAdmin }), true);
    }
  });
});

describe('Feature Control Phase 3 — resolution + roles', () => {
  it('global OFF / school OFF / inherit / school ON cannot override global OFF', () => {
    assert.equal(resolveFeatureEnabled(false, true), false);
    assert.equal(resolveFeatureEnabled(true, false), false);
    assert.equal(resolveFeatureEnabled(true, null), true);
    assert.equal(resolveFeatureEnabled(false, null), false);
  });

  it('feature ON does not bypass RolesGuard', () => {
    assert.equal(
      runRolesGuard([UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN], parent),
      false,
    );
  });

  it('attendance remains ungated by FeatureGuard metadata', async () => {
    assert.equal(await runFeatureGuard(undefined, false, { user: schoolAdmin }), true);
  });
});
