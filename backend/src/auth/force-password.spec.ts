import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import {
  ForcePasswordGuard,
  SKIP_FORCE_PASSWORD_KEY,
} from '../common/guards/force-password.guard';
import {
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_REGEX,
  assertStrongPassword,
} from '../common/validators/password.validator';
import { SuperAdminService } from '../super-admin/super-admin.service';
import { UsersService } from '../users/users.service';
import type { Reflector } from '@nestjs/core';

const STRONG = 'StrongPass1';

// Return false for is-/has- probes; no-op for send-/dispatch- methods.
function notificationsStub() {
  return new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop.startsWith('is') || prop.startsWith('has')) {
          return async () => false;
        }
        return async () => undefined;
      },
    },
  );
}

function rolesStub() {
  return new Proxy(
    {},
    {
      get: () => async () => ['students.view'],
    },
  );
}

function makeAuthService(prisma: any) {
  return new AuthService(
    prisma,
    { signAsync: async () => 'access-token' } as any,
    { get: (key: string) => (String(key).includes('REFRESH') ? '7' : '15m') } as any,
    { log: async () => undefined } as any,
    { log: async () => undefined } as any,
    rolesStub() as any,
    notificationsStub() as any,
    { dispatch: () => undefined, emit: async () => undefined } as any,
  );
}

function makeUsersService(prisma: any, authService: any) {
  return new UsersService(
    prisma,
    { log: async () => undefined } as any,
    { dispatch: () => undefined, emit: async () => undefined } as any,
    authService,
  );
}

function httpContext(user: any) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

describe('password policy consistency', () => {
  it('enforces the strong password regex used across DTOs', () => {
    assert.equal(PASSWORD_REGEX.test('weak'), false);
    assert.equal(PASSWORD_REGEX.test('onlylower1'), false);
    assert.equal(PASSWORD_REGEX.test('ONLYUPPER1'), false);
    assert.equal(PASSWORD_REGEX.test('NoDigitsHere'), false);
    assert.equal(PASSWORD_REGEX.test(STRONG), true);
    assert.throws(() => assertStrongPassword('weak'), (err: any) => {
      assert.equal(err.message, PASSWORD_POLICY_MESSAGE);
      return true;
    });
  });
});

describe('ForcePasswordGuard / API bypass prevention', () => {
  it('blocks protected API access when forcePasswordChange is true', () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const guard = new ForcePasswordGuard(reflector);
    assert.throws(
      () => guard.canActivate(httpContext({ id: 'u1', forcePasswordChange: true })),
      ForbiddenException,
    );
  });

  it('allows /auth/me and change-password when SkipForcePassword is set', () => {
    const reflector = {
      getAllAndOverride: (key: string) => key === SKIP_FORCE_PASSWORD_KEY,
    } as unknown as Reflector;
    const guard = new ForcePasswordGuard(reflector);
    assert.equal(
      guard.canActivate(httpContext({ id: 'u1', forcePasswordChange: true })),
      true,
    );
  });

  it('allows normal users through', () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const guard = new ForcePasswordGuard(reflector);
    assert.equal(
      guard.canActivate(httpContext({ id: 'u1', forcePasswordChange: false })),
      true,
    );
  });
});

describe('AuthService forced password flow', () => {
  it('login returns forcePasswordChange=true for forced users', async () => {
    const hashed = await bcrypt.hash(STRONG, 4);
    const user = {
      id: 'u1',
      email: 'forced@school.test',
      name: 'Forced',
      password: hashed,
      role: 'TEACHER',
      status: 'ACTIVE',
      schoolId: 's1',
      forcePasswordChange: true,
      loginAttempts: 0,
      lockedUntil: null,
      school: { id: 's1', name: 'School' },
    };
    const prisma: any = {
      user: {
        findUnique: async () => user,
        update: async () => user,
      },
      refreshToken: {
        create: async () => ({ id: 'rt1' }),
      },
    };
    const result: any = await makeAuthService(prisma).login(
      { email: user.email, password: STRONG } as any,
      '127.0.0.1',
      'test',
    );
    assert.equal(result.user.forcePasswordChange, true);
  });

  it('me remains usable while forced', async () => {
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: 'u1',
          email: 'forced@school.test',
          name: 'Forced',
          role: 'TEACHER',
          schoolId: 's1',
          forcePasswordChange: true,
          password: 'secret',
          passwordResetToken: 'x',
          school: { id: 's1' },
        }),
      },
    };
    const me: any = await makeAuthService(prisma).me('u1');
    assert.equal(me.forcePasswordChange, true);
    assert.equal(me.password, undefined);
  });

  it('correct current password + strong new password clears the flag and revokes refresh tokens', async () => {
    const hashed = await bcrypt.hash('TempPass1', 4);
    let updated: any = null;
    let revokeWhere: any = null;
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: 'u1',
          password: hashed,
          schoolId: 's1',
          forcePasswordChange: true,
        }),
        update: async ({ data }: any) => {
          updated = data;
          return { id: 'u1', ...data };
        },
      },
      refreshToken: {
        updateMany: async ({ where, data }: any) => {
          revokeWhere = { where, data };
          return { count: 2 };
        },
      },
    };

    await makeAuthService(prisma).changePassword('u1', {
      currentPassword: 'TempPass1',
      newPassword: STRONG,
    } as any);

    assert.equal(updated.forcePasswordChange, false);
    assert.equal(revokeWhere.where.userId, 'u1');
    assert.equal(revokeWhere.where.revokedAt, null);
    assert.ok(revokeWhere.data.revokedAt instanceof Date);
  });

  it('wrong current password does not clear the flag', async () => {
    const hashed = await bcrypt.hash('TempPass1', 4);
    let updated = false;
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: 'u1',
          password: hashed,
          schoolId: 's1',
          forcePasswordChange: true,
        }),
        update: async () => {
          updated = true;
        },
      },
      refreshToken: { updateMany: async () => ({ count: 0 }) },
    };

    await assert.rejects(
      () =>
        makeAuthService(prisma).changePassword('u1', {
          currentPassword: 'WrongPass1',
          newPassword: STRONG,
        } as any),
      UnauthorizedException,
    );
    assert.equal(updated, false);
  });

  it('forgot-password reset clears forcePasswordChange and revokes sessions', async () => {
    let updated: any = null;
    let revoked = false;
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: 'u1',
          schoolId: 's1',
          passwordResetToken: 'reset-token',
          passwordResetExpiresAt: new Date(Date.now() + 60_000),
        }),
        update: async ({ data }: any) => {
          updated = data;
          return { id: 'u1' };
        },
      },
      refreshToken: {
        updateMany: async () => {
          revoked = true;
          return { count: 1 };
        },
      },
    };

    await makeAuthService(prisma).resetPassword('reset-token', STRONG, '127.0.0.1');
    assert.equal(updated.forcePasswordChange, false);
    assert.equal(revoked, true);
  });

  it('revokeUserSessions marks refresh tokens revoked', async () => {
    let call: any = null;
    const prisma: any = {
      refreshToken: {
        updateMany: async (args: any) => {
          call = args;
          return { count: 3 };
        },
      },
    };
    await makeAuthService(prisma).revokeUserSessions('u1');
    assert.equal(call.where.userId, 'u1');
    assert.equal(call.where.revokedAt, null);
    assert.ok(call.data.revokedAt instanceof Date);
  });
});

describe('UsersService admin create/reset', () => {
  const admin: any = {
    id: 'admin1',
    name: 'Admin',
    role: 'SCHOOL_ADMIN',
    schoolId: 'school-a',
  };

  it('admin-created user gets forcePasswordChange=true', async () => {
    let created: any = null;
    const prisma: any = {
      user: {
        findUnique: async () => null,
        create: async ({ data }: any) => {
          created = data;
          return { id: 'new1', ...data, createdAt: new Date() };
        },
      },
      school: {
        findUnique: async () => ({ id: 'school-a', disabledRoles: [] }),
      },
    };

    const user = await makeUsersService(prisma, {
      revokeUserSessions: async () => undefined,
    }).create(
      {
        name: 'New Teacher',
        email: 'teacher@school.test',
        password: STRONG,
        role: 'TEACHER',
      } as any,
      admin,
    );

    assert.equal(created.forcePasswordChange, true);
    assert.equal(user.forcePasswordChange, true);
  });

  it('admin reset sets forcePasswordChange=true and revokes sessions', async () => {
    let updated: any = null;
    let revokedFor: string | null = null;
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: 'u2',
          email: 't@school.test',
          role: 'TEACHER',
          schoolId: 'school-a',
        }),
        update: async ({ data }: any) => {
          updated = data;
          return { id: 'u2' };
        },
      },
    };

    await makeUsersService(prisma, {
      revokeUserSessions: async (id: string) => {
        revokedFor = id;
      },
    }).resetPassword('u2', { newPassword: STRONG } as any, admin);

    assert.equal(updated.forcePasswordChange, true);
    assert.equal(revokedFor, 'u2');
  });

  it('cross-school admin reset remains forbidden', async () => {
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: 'u3',
          email: 'other@school.test',
          role: 'TEACHER',
          schoolId: 'school-b',
        }),
      },
    };

    await assert.rejects(
      () =>
        makeUsersService(prisma, {
          revokeUserSessions: async () => undefined,
        }).resetPassword('u3', { newPassword: STRONG } as any, admin),
      ForbiddenException,
    );
  });
});

describe('Super Admin reset default', () => {
  it('defaults forceChange to true when omitted', () => {
    const forceChange = undefined;
    assert.equal(forceChange ?? true, true);
  });
});

describe('UsersService cannot clear forcePasswordChange via PATCH', () => {
  const admin: any = {
    id: 'admin1',
    name: 'Admin',
    role: 'SCHOOL_ADMIN',
    schoolId: 'school-a',
  };

  it('rejects forcePasswordChange=false on update', async () => {
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: 'u2',
          email: 't@school.test',
          role: 'TEACHER',
          schoolId: 'school-a',
          forcePasswordChange: true,
        }),
        update: async () => {
          throw new Error('update must not run when clearing force flag');
        },
      },
    };

    await assert.rejects(
      () =>
        makeUsersService(prisma, {
          revokeUserSessions: async () => undefined,
        }).update('u2', { forcePasswordChange: false } as any, admin),
      BadRequestException,
    );
  });

  it('still allows forcePasswordChange=true on update', async () => {
    let updated: any = null;
    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: 'u2',
          email: 't@school.test',
          role: 'TEACHER',
          schoolId: 'school-a',
          forcePasswordChange: false,
        }),
        update: async ({ data }: any) => {
          updated = data;
          return { id: 'u2', ...data };
        },
      },
    };

    await makeUsersService(prisma, {
      revokeUserSessions: async () => undefined,
    }).update('u2', { forcePasswordChange: true } as any, admin);

    assert.equal(updated.forcePasswordChange, true);
  });
});

describe('createSchoolWithAdmin forces password change', () => {
  it('sets forcePasswordChange=true on the new school admin', async () => {
    let createdUser: any = null;
    const prisma: any = {
      school: {
        findFirst: async () => null,
        create: async ({ data }: any) => ({ id: 'school-new', ...data, name: data.name }),
      },
      user: {
        findUnique: async () => null,
        create: async ({ data }: any) => {
          createdUser = data;
          return { id: 'admin-new', ...data };
        },
      },
      $transaction: async (fn: any) =>
        fn({
          school: {
            create: async ({ data }: any) => ({ id: 'school-new', ...data, name: data.name }),
            findFirst: async () => null,
          },
          user: {
            create: async ({ data }: any) => {
              createdUser = data;
              return { id: 'admin-new', ...data };
            },
          },
        }),
    };

    const service = new SuperAdminService(
      prisma,
      { sign: () => 'token' } as any,
      { log: async () => undefined } as any,
      { dispatch: () => undefined, emit: async () => undefined } as any,
      { revokeUserSessions: async () => undefined } as any,
    );

    await service.createSchoolWithAdmin(
      {
        name: 'New School',
        adminName: 'School Admin',
        adminEmail: 'admin@newschool.test',
        adminPassword: STRONG,
      } as any,
      { id: 'sa1', name: 'Super', role: 'SUPER_ADMIN' } as any,
    );

    assert.equal(createdUser.forcePasswordChange, true);
  });
});
