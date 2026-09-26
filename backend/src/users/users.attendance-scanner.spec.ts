import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { UsersService } from './users.service';

const schoolA = 'school-a';

const schoolAdmin = {
  id: 'admin-1',
  email: 'admin@test',
  name: 'Admin',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: schoolA,
};

const superAdmin = {
  id: 'sa-1',
  email: 'sa@test',
  name: 'Super',
  role: UserRole.SUPER_ADMIN,
  schoolId: null as string | null,
};

function makeUsersService(prisma: Record<string, unknown>) {
  return new UsersService(
    prisma as any,
    { log: async () => undefined } as any,
    {
      dispatch: (fn: () => unknown) => {
        try {
          fn();
        } catch {
          /* ignore in unit tests */
        }
      },
      emitNewUser: async () => undefined,
    } as any,
    {} as any,
  );
}

describe('ATTENDANCE_SCANNER user assignment', () => {
  it('SCHOOL_ADMIN can create an ATTENDANCE_SCANNER user for its own school', async () => {
    const created: { data?: Record<string, unknown> } = {};
    const svc = makeUsersService({
      user: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.data = data;
          return { id: 'u-1', ...data, createdAt: new Date(), lastLoginAt: null };
        },
      },
      school: {
        findUnique: async () => ({ id: schoolA, disabledRoles: [] }),
      },
    });

    const user = await svc.create(
      {
        name: 'Gate Scanner',
        email: 'scanner1@test.com',
        password: 'Str0ng!Passw0rd',
        role: UserRole.ATTENDANCE_SCANNER,
      } as any,
      schoolAdmin as any,
    );

    assert.equal(created.data?.role, UserRole.ATTENDANCE_SCANNER);
    assert.equal(created.data?.schoolId, schoolA);
    assert.equal(created.data?.status, UserStatus.ACTIVE);
    assert.equal(user.role, UserRole.ATTENDANCE_SCANNER);
  });

  it('multiple ATTENDANCE_SCANNER users can belong to the same school', async () => {
    const emails: string[] = [];
    const svc = makeUsersService({
      user: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          emails.push(String(data.email));
          return { id: `u-${emails.length}`, ...data, createdAt: new Date(), lastLoginAt: null };
        },
      },
      school: {
        findUnique: async () => ({ id: schoolA, disabledRoles: [] }),
      },
    });

    await svc.create(
      {
        name: 'Scanner One',
        email: 'scanner-a@test.com',
        password: 'Str0ng!Passw0rd',
        role: UserRole.ATTENDANCE_SCANNER,
      } as any,
      schoolAdmin as any,
    );
    await svc.create(
      {
        name: 'Scanner Two',
        email: 'scanner-b@test.com',
        password: 'Str0ng!Passw0rd',
        role: UserRole.ATTENDANCE_SCANNER,
      } as any,
      schoolAdmin as any,
    );
    assert.deepEqual(emails, ['scanner-a@test.com', 'scanner-b@test.com']);
  });

  it('disabledRoles blocks ATTENDANCE_SCANNER assignment', async () => {
    const svc = makeUsersService({
      user: { findUnique: async () => null },
      school: {
        findUnique: async () => ({
          id: schoolA,
          disabledRoles: [UserRole.ATTENDANCE_SCANNER],
        }),
      },
    });

    await assert.rejects(
      () =>
        svc.create(
          {
            name: 'Blocked Scanner',
            email: 'blocked@test.com',
            password: 'Str0ng!Passw0rd',
            role: UserRole.ATTENDANCE_SCANNER,
          } as any,
          schoolAdmin as any,
        ),
      ForbiddenException,
    );
  });

  it('SUPER_ADMIN still requires schoolId when creating school scanner users', async () => {
    const svc = makeUsersService({
      user: { findUnique: async () => null },
      school: { findUnique: async () => ({ id: schoolA, disabledRoles: [] }) },
    });

    await assert.rejects(
      () =>
        svc.create(
          {
            name: 'No School Scanner',
            email: 'noschool@test.com',
            password: 'Str0ng!Passw0rd',
            role: UserRole.ATTENDANCE_SCANNER,
          } as any,
          superAdmin as any,
        ),
      BadRequestException,
    );
  });

  it('cannot assign platform roles via school user management', async () => {
    const svc = makeUsersService({
      user: { findUnique: async () => null },
    });
    await assert.rejects(
      () =>
        svc.create(
          {
            name: 'Bad',
            email: 'bad@test.com',
            password: 'Str0ng!Passw0rd',
            role: UserRole.SUPER_ADMIN,
          } as any,
          schoolAdmin as any,
        ),
      ForbiddenException,
    );
  });
});
