import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { FEATURE_DISABLED_CODE } from './feature.constants';
import { FeaturesService, resolveFeatureEnabled } from './features.service';
import { FeatureGuard } from './feature.guard';

const schoolA = 'school-a';
const schoolB = 'school-b';

const superAdmin = {
  id: 'sa',
  email: 'sa@test',
  name: 'SA',
  role: UserRole.SUPER_ADMIN,
  schoolId: null as string | null,
};

const schoolAdmin = {
  id: 'admin-a',
  email: 'a@test',
  name: 'Admin A',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: schoolA,
};

describe('resolveFeatureEnabled', () => {
  it('global ON + no override -> ON', () => {
    assert.equal(resolveFeatureEnabled(true, null), true);
    assert.equal(resolveFeatureEnabled(true, undefined), true);
  });

  it('global ON + school OFF -> OFF', () => {
    assert.equal(resolveFeatureEnabled(true, false), false);
  });

  it('global ON + school ON -> ON', () => {
    assert.equal(resolveFeatureEnabled(true, true), true);
  });

  it('global OFF + school ON -> OFF (global wins)', () => {
    assert.equal(resolveFeatureEnabled(false, true), false);
  });

  it('global OFF + school OFF -> OFF', () => {
    assert.equal(resolveFeatureEnabled(false, false), false);
  });
});

describe('FeaturesService resolution and admin mutations', () => {
  function makeSvc(opts: {
    feature?: any;
    override?: any | null;
    schools?: any[];
    updates?: any[];
  }) {
    const feature =
      opts.feature ??
      ({
        id: 'feat-comm',
        key: 'communication',
        name: 'Communication',
        description: 'x',
        isGloballyEnabled: true,
        isCore: false,
      } as const);

    const store = {
      feature: { ...feature },
      override: opts.override === undefined ? null : opts.override,
      deleted: false,
    };

    const prisma = {
      feature: {
        findUnique: async ({ where }: any) =>
          where.key === store.feature.key || where.id === store.feature.id
            ? { ...store.feature }
            : null,
        findMany: async () => [{ ...store.feature }],
        update: async ({ data }: any) => {
          Object.assign(store.feature, data);
          return { ...store.feature };
        },
        upsert: async () => store.feature,
      },
      schoolFeature: {
        findUnique: async () => store.override,
        findMany: async () => (store.override ? [store.override] : []),
        upsert: async ({ create, update }: any) => {
          store.override = {
            id: 'sf1',
            schoolId: create.schoolId,
            featureId: create.featureId,
            isEnabled: update?.isEnabled ?? create.isEnabled,
          };
          return store.override;
        },
        deleteMany: async () => {
          store.override = null;
          store.deleted = true;
          return { count: 1 };
        },
      },
      school: {
        findUnique: async ({ where }: any) =>
          where.id === schoolA || where.id === schoolB
            ? { id: where.id, name: where.id }
            : null,
        findMany: async () =>
          opts.schools ?? [
            { id: schoolA, name: 'A', slug: 'a', status: 'ACTIVE' },
            { id: schoolB, name: 'B', slug: 'b', status: 'ACTIVE' },
          ],
      },
    };

    return { svc: new FeaturesService(prisma as any), store };
  }

  it('missing school override inherits ON when global ON', async () => {
    const { svc } = makeSvc({ override: null });
    assert.equal(await svc.isFeatureEnabled('communication', schoolA), true);
  });

  it('school OFF override disables when global ON', async () => {
    const { svc } = makeSvc({
      override: { id: 'sf', schoolId: schoolA, featureId: 'feat-comm', isEnabled: false },
    });
    assert.equal(await svc.isFeatureEnabled('communication', schoolA), false);
  });

  it('global OFF wins over school ON', async () => {
    const { svc } = makeSvc({
      feature: {
        id: 'feat-comm',
        key: 'communication',
        name: 'Communication',
        description: 'x',
        isGloballyEnabled: false,
        isCore: false,
      },
      override: { id: 'sf', schoolId: schoolA, featureId: 'feat-comm', isEnabled: true },
    });
    assert.equal(await svc.isFeatureEnabled('communication', schoolA), false);
  });

  it('reset override returns to inherit', async () => {
    const { svc, store } = makeSvc({
      override: { id: 'sf', schoolId: schoolA, featureId: 'feat-comm', isEnabled: false },
    });
    const res = await svc.resetSchoolOverride('communication', schoolA, superAdmin as any);
    assert.equal(store.deleted, true);
    assert.equal(res.override, 'INHERIT');
    assert.equal(res.isEnabled, true);
  });

  it('unknown feature key -> NotFound', async () => {
    const { svc } = makeSvc({});
    await assert.rejects(() => svc.getFeatureDetail('nope'), NotFoundException);
  });

  it('nonexistent school -> NotFound', async () => {
    const { svc } = makeSvc({});
    await assert.rejects(
      () => svc.setSchoolOverride('communication', 'missing', false, superAdmin as any),
      NotFoundException,
    );
  });

  it('core feature cannot be globally disabled', async () => {
    const { svc } = makeSvc({
      feature: {
        id: 'feat-att',
        key: 'attendance',
        name: 'Attendance',
        description: 'x',
        isGloballyEnabled: true,
        isCore: true,
      },
    });
    await assert.rejects(
      () => svc.setGlobal('attendance', false, superAdmin as any),
      BadRequestException,
    );
  });

  it('SCHOOL_ADMIN cannot mutate features', async () => {
    const { svc } = makeSvc({});
    await assert.rejects(
      () => svc.setGlobal('communication', false, schoolAdmin as any),
      ForbiddenException,
    );
    await assert.rejects(
      () => svc.setSchoolOverride('communication', schoolA, false, schoolAdmin as any),
      ForbiddenException,
    );
  });

  it('SUPER_ADMIN can set school override on selected school', async () => {
    const { svc } = makeSvc({});
    const res = await svc.setSchoolOverride('communication', schoolB, false, superAdmin as any);
    assert.equal(res.schoolId, schoolB);
    assert.equal(res.override, 'OFF');
  });
  it('core feature cannot be disabled for a school', async () => {
    const { svc } = makeSvc({
      feature: {
        id: 'feat-att',
        key: 'attendance',
        name: 'Attendance',
        description: 'x',
        isGloballyEnabled: true,
        isCore: true,
      },
    });

    await assert.rejects(
      () =>
        svc.setSchoolOverride(
          'attendance',
          schoolA,
          false,
          superAdmin as any,
        ),
      /Core feature 'attendance' cannot be disabled for a school/,
    );
  });

  it('getEffectiveFeatures avoids N+1 and returns map', async () => {
    const { svc } = makeSvc({
      override: { id: 'sf', schoolId: schoolA, featureId: 'feat-comm', isEnabled: false },
    });
    const map = await svc.getEffectiveFeatures(schoolA);
    assert.equal(map.communication, false);
  });
});

describe('FeatureGuard', () => {
  const prismaStub = {} as any;

  it('blocks when feature disabled for school user', async () => {
    const featuresService = {
      isFeatureEnabled: async () => false,
      assertFeatureDisabledForbidden: (key: string) => {
        throw new ForbiddenException(`[${FEATURE_DISABLED_CODE}] Feature '${key}' is disabled`);
      },
    };
    const reflector = {
      getAllAndOverride: (key: string) =>
        key === 'requireFeature' ? 'communication' : undefined,
    };
    const guard = new FeatureGuard(reflector as any, featuresService as any, prismaStub);
    await assert.rejects(
      () =>
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({
              method: 'GET',
              user: { role: UserRole.SCHOOL_ADMIN, schoolId: schoolA },
              query: {},
              body: {},
            }),
          }),
          getHandler: () => ({}),
          getClass: () => ({}),
        } as any),
      ForbiddenException,
    );
  });

  it('allows when feature enabled', async () => {
    const featuresService = {
      isFeatureEnabled: async () => true,
      assertFeatureDisabledForbidden: () => {
        throw new Error('should not call');
      },
    };
    const reflector = {
      getAllAndOverride: (key: string) =>
        key === 'requireFeature' ? 'communication' : undefined,
    };
    const guard = new FeatureGuard(reflector as any, featuresService as any, prismaStub);
    assert.equal(
      await guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            method: 'GET',
            user: { role: UserRole.SCHOOL_ADMIN, schoolId: schoolA },
            query: {},
            body: {},
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any),
      true,
    );
  });

  it('skips when no RequireFeature metadata', async () => {
    const guard = new FeatureGuard(
      { getAllAndOverride: () => undefined } as any,
      {} as any,
      prismaStub,
    );
    assert.equal(
      await guard.canActivate({
        switchToHttp: () => ({ getRequest: () => ({ method: 'GET' }) }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any),
      true,
    );
  });
});
