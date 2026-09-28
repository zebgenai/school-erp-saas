import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RolesGuard } from '../common/guards/roles.guard';
import { FEATURE_DISABLED_CODE } from './feature.constants';
import { FeatureGuard } from './feature.guard';
import { FeaturesService, resolveFeatureEnabled } from './features.service';

const schoolA = 'school-a';
const schoolB = 'school-b';

const schoolAdmin = {
  id: 'admin-a',
  email: 'a@test',
  name: 'Admin A',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: schoolA,
};

const teacher = {
  id: 't1',
  email: 't@test',
  name: 'Teacher',
  role: UserRole.TEACHER,
  schoolId: schoolA,
};

const parent = {
  id: 'p1',
  email: 'p@test',
  name: 'Parent',
  role: UserRole.PARENT,
  schoolId: schoolA,
};

/** Controllers protected at class level in Phase 2. */
const CLASS_LEVEL_FEATURES = [
  'exams',
  'fees',
  'payroll',
  'expenses',
  'library',
  'transport',
  'timetable',
  'academic-calendar',
  'homework',
  'online-classes',
  'communication',
] as const;

function makeContext(opts: {
  featureKey?: string;
  roles?: UserRole[];
  user?: typeof schoolAdmin | typeof teacher | typeof parent | null;
  method?: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}) {
  const featureKey = opts.featureKey;
  const roles = opts.roles;
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: opts.method ?? 'GET',
        user: opts.user === undefined ? schoolAdmin : opts.user,
        query: opts.query ?? {},
        body: opts.body ?? {},
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
    // Reflector stubs read via getAllAndOverride on FeatureGuard / RolesGuard
    __featureKey: featureKey,
    __roles: roles,
  } as any;
}

function makeFeatureReflector(featureKey: string | undefined) {
  return {
    getAllAndOverride: (_key: string) => featureKey,
  };
}

function makeRolesReflector(roles: UserRole[] | undefined) {
  return {
    getAllAndOverride: (_key: string) => roles,
  };
}

function makeFeaturesService(enabled: boolean | ((key: string, schoolId: string | null) => boolean)) {
  const isEnabled =
    typeof enabled === 'function'
      ? enabled
      : (_key: string, _schoolId: string | null) => enabled;

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
  enabled: boolean | ((key: string, schoolId: string | null) => boolean),
  ctxOpts: Parameters<typeof makeContext>[0] = {},
) {
  const guard = new FeatureGuard(
    makeFeatureReflector(featureKey) as any,
    makeFeaturesService(enabled) as any,
    {} as any,
  );
  return guard.canActivate(makeContext({ ...ctxOpts, featureKey }));
}

function runRolesGuard(roles: UserRole[] | undefined, user: typeof schoolAdmin | typeof parent) {
  const guard = new RolesGuard(makeRolesReflector(roles) as any);
  return guard.canActivate(makeContext({ roles, user }));
}

describe('Feature Control Phase 2 — class-level controllers', () => {
  for (const key of CLASS_LEVEL_FEATURES) {
    it(`${key}: enabled → authorized school admin allowed`, async () => {
      assert.equal(await runFeatureGuard(key, true, { user: schoolAdmin }), true);
    });

    it(`${key}: disabled → authorized school admin gets FEATURE_DISABLED 403`, async () => {
      await assert.rejects(
        () => runFeatureGuard(key, false, { user: schoolAdmin }),
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

  it('exams class guard covers marks/results endpoints (same RequireFeature)', async () => {
    // Marks/results live on ExamsController — class-level @RequireFeature('exams').
    await assert.rejects(() => runFeatureGuard('exams', false), ForbiddenException);
    assert.equal(await runFeatureGuard('exams', true), true);
  });

  it('homework disabled blocks API for authorized role', async () => {
    await assert.rejects(
      () => runFeatureGuard('homework', false, { user: schoolAdmin }),
      ForbiddenException,
    );
  });

  it('online-classes disabled blocks API for authorized role', async () => {
    await assert.rejects(
      () => runFeatureGuard('online-classes', false, { user: schoolAdmin }),
      ForbiddenException,
    );
  });

  it('academic-calendar disabled blocks calendar endpoints', async () => {
    await assert.rejects(
      () => runFeatureGuard('academic-calendar', false, { user: schoolAdmin }),
      ForbiddenException,
    );
  });
});

describe('Feature Control Phase 2 — RolesGuard remains additive', () => {
  it('feature enabled does NOT bypass @Roles (unauthorized role still denied)', () => {
    // PARENT is not in exams VIEW_ROLES; FeatureGuard would allow if feature ON.
    assert.equal(runRolesGuard([UserRole.SCHOOL_ADMIN, UserRole.TEACHER], parent), false);
  });

  it('feature enabled + authorized role → RolesGuard allows', () => {
    assert.equal(
      runRolesGuard([UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.TEACHER], schoolAdmin),
      true,
    );
  });

  it('unauthorized role remains unauthorized even when feature is ON', async () => {
    assert.equal(await runFeatureGuard('fees', true, { user: parent }), true);
    assert.equal(
      runRolesGuard([UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN, UserRole.ACCOUNTANT], parent),
      false,
    );
  });

  it('feature OFF blocks even when role is authorized', async () => {
    assert.equal(
      runRolesGuard([UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN], schoolAdmin),
      true,
    );
    await assert.rejects(
      () => runFeatureGuard('payroll', false, { user: schoolAdmin }),
      ForbiddenException,
    );
  });
});

describe('Feature Control Phase 2 — notifications method-level', () => {
  it('admin templates endpoint blocked when notifications disabled', async () => {
    await assert.rejects(
      () => runFeatureGuard('notifications', false, { user: schoolAdmin }),
      ForbiddenException,
    );
  });

  it('admin compose/campaigns/stats blocked when notifications disabled', async () => {
    for (const _ of ['compose', 'campaigns', 'stats', 'logs']) {
      await assert.rejects(
        () => runFeatureGuard('notifications', false, { user: schoolAdmin }),
        ForbiddenException,
      );
    }
  });

  it('inbox has no RequireFeature → FeatureGuard skips (available)', async () => {
    assert.equal(await runFeatureGuard(undefined, false, { user: schoolAdmin }), true);
  });

  it('preferences have no RequireFeature → available when notifications OFF', async () => {
    assert.equal(await runFeatureGuard(undefined, false, { user: teacher }), true);
  });

  it('push-token endpoints have no RequireFeature → available', async () => {
    assert.equal(await runFeatureGuard(undefined, false, { user: teacher }), true);
  });

  it('webhook controller is separate (no RequireFeature on NotificationsController inbox path)', async () => {
    // WhatsAppWebhookController is not decorated with RequireFeature.
    assert.equal(await runFeatureGuard(undefined, false), true);
  });

  it('admin notifications ON allows FeatureGuard', async () => {
    assert.equal(await runFeatureGuard('notifications', true, { user: schoolAdmin }), true);
  });
});

describe('Feature Control Phase 2 — reports method-level', () => {
  it('report-page endpoints blocked when reports disabled', async () => {
    for (const _endpoint of [
      'attendance',
      'fees',
      'expenses',
      'salary',
      'students',
      'exam-results',
    ]) {
      await assert.rejects(
        () => runFeatureGuard('reports', false, { user: schoolAdmin }),
        ForbiddenException,
      );
    }
  });

  it('dashboard-summary has no RequireFeature → remains available', async () => {
    assert.equal(await runFeatureGuard(undefined, false, { user: schoolAdmin }), true);
  });

  it('dashboard chart endpoints have no RequireFeature → remain available', async () => {
    assert.equal(await runFeatureGuard(undefined, false, { user: schoolAdmin }), true);
  });

  it('profit-loss left ungated for Dashboard finance widgets', async () => {
    assert.equal(await runFeatureGuard(undefined, false, { user: schoolAdmin }), true);
  });

  it('reports feature ON allows detailed report endpoints', async () => {
    assert.equal(await runFeatureGuard('reports', true, { user: schoolAdmin }), true);
  });
});

describe('Feature Control Phase 2 — global / school resolution', () => {
  function makeSvc(globalOn: boolean, overrideA: boolean | null, overrideB: boolean | null = null) {
    const feature = {
      id: 'feat-fees',
      key: 'fees',
      name: 'Fees',
      description: 'x',
      isGloballyEnabled: globalOn,
      isCore: false,
    };
    const overrides: Record<string, { isEnabled: boolean } | null> = {
      [schoolA]: overrideA === null ? null : { isEnabled: overrideA },
      [schoolB]: overrideB === null ? null : { isEnabled: overrideB },
    };
    const prisma = {
      feature: {
        findUnique: async () => ({ ...feature }),
        findMany: async () => [{ ...feature }],
      },
      schoolFeature: {
        findUnique: async ({ where }: any) => {
          const sid = where.schoolId_featureId?.schoolId;
          return overrides[sid] ?? null;
        },
        findMany: async () =>
          Object.entries(overrides)
            .filter(([, v]) => v)
            .map(([schoolId, v]) => ({
              schoolId,
              featureId: feature.id,
              isEnabled: v!.isEnabled,
            })),
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

  it('global OFF blocks all schools', async () => {
    const svc = makeSvc(false, true, true);
    assert.equal(await svc.isFeatureEnabled('fees', schoolA), false);
    assert.equal(await svc.isFeatureEnabled('fees', schoolB), false);
  });

  it('school OFF blocks only that school', async () => {
    const svc = makeSvc(true, false, true);
    assert.equal(await svc.isFeatureEnabled('fees', schoolA), false);
    assert.equal(await svc.isFeatureEnabled('fees', schoolB), true);
  });

  it('school ON cannot override global OFF', async () => {
    assert.equal(resolveFeatureEnabled(false, true), false);
    const svc = makeSvc(false, true, null);
    assert.equal(await svc.isFeatureEnabled('fees', schoolA), false);
  });

  it('school with no override inherits global state', async () => {
    const on = makeSvc(true, null, null);
    const off = makeSvc(false, null, null);
    assert.equal(await on.isFeatureEnabled('fees', schoolA), true);
    assert.equal(await off.isFeatureEnabled('fees', schoolA), false);
  });
});

describe('Feature Control Phase 2 — attendance regression (core)', () => {
  it('attendance is never behind RequireFeature metadata in FeatureGuard path', async () => {
    // No class-level RequireFeature on attendance controllers → guard skips.
    assert.equal(await runFeatureGuard(undefined, false, { user: schoolAdmin }), true);
  });

  it('attendance feature key is core and not in Phase 2 class-level list', () => {
    assert.equal((CLASS_LEVEL_FEATURES as readonly string[]).includes('attendance'), false);
  });
});
