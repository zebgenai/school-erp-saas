import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AttendanceController } from './attendance.controller';
import { ActivityController } from '../activity/activity.controller';
import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_LABELS,
  SCHOOL_SCOPED_ROLES,
} from '../roles/roles.constants';

function rolesOn(controller: object, method: string): UserRole[] {
  const proto = Object.getPrototypeOf(controller);
  return Reflect.getMetadata(ROLES_KEY, proto[method]) ?? [];
}

function guardAllows(required: UserRole[], role: UserRole): boolean {
  const reflector = {
    getAllAndOverride: () => required,
  } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', user: { role } }),
    }),
  } as any;
  return guard.canActivate(ctx);
}

describe('ATTENDANCE_SCANNER role wiring', () => {
  const controller = new AttendanceController({} as any, {} as any);

  it('labels and school-scoped lists include Attendance Scanner', () => {
    assert.equal(ROLE_LABELS[UserRole.ATTENDANCE_SCANNER], 'Attendance Scanner');
    assert.ok(SCHOOL_SCOPED_ROLES.includes(UserRole.ATTENDANCE_SCANNER));
    assert.equal(DEFAULT_ROLE_PERMISSIONS.ATTENDANCE_SCANNER['attendance.view'], true);
    assert.equal(DEFAULT_ROLE_PERMISSIONS.ATTENDANCE_SCANNER['attendance.create'], true);
    assert.equal(DEFAULT_ROLE_PERMISSIONS.ATTENDANCE_SCANNER['students.view'], false);
    assert.equal(DEFAULT_ROLE_PERMISSIONS.ATTENDANCE_SCANNER['fees.view'], false);
    assert.equal(DEFAULT_ROLE_PERMISSIONS.ATTENDANCE_SCANNER['teachers.view'], false);
    assert.equal(DEFAULT_ROLE_PERMISSIONS.ATTENDANCE_SCANNER['settings.view'], false);
    assert.equal(DEFAULT_ROLE_PERMISSIONS.ATTENDANCE_SCANNER['reports.view'], false);
  });

  it('student QR endpoint allows ATTENDANCE_SCANNER', () => {
    const roles = rolesOn(controller, 'markFromQrScan');
    assert.ok(roles.includes(UserRole.ATTENDANCE_SCANNER));
    assert.ok(roles.includes(UserRole.SCHOOL_ADMIN));
    assert.ok(roles.includes(UserRole.TEACHER));
    assert.ok(!roles.includes(UserRole.SUPER_ADMIN));
    assert.equal(guardAllows(roles, UserRole.ATTENDANCE_SCANNER), true);
  });

  it('teacher QR endpoint allows ATTENDANCE_SCANNER', () => {
    const roles = rolesOn(controller, 'punchTeacherFromQr');
    assert.ok(roles.includes(UserRole.ATTENDANCE_SCANNER));
    assert.ok(roles.includes(UserRole.RECEPTIONIST));
    assert.equal(guardAllows(roles, UserRole.ATTENDANCE_SCANNER), true);
  });

  it('manual student mark/bulk/patch deny ATTENDANCE_SCANNER', () => {
    for (const method of ['mark', 'markBulk', 'update'] as const) {
      const roles = rolesOn(controller, method);
      assert.ok(!roles.includes(UserRole.ATTENDANCE_SCANNER), method);
      assert.equal(guardAllows(roles, UserRole.ATTENDANCE_SCANNER), false, method);
    }
  });

  it('manual teacher punch and attendance lists deny ATTENDANCE_SCANNER', () => {
    for (const method of [
      'punchTeacher',
      'findTeacherAttendance',
      'findAll',
      'getSummary',
      'getClassReport',
    ] as const) {
      const roles = rolesOn(controller, method);
      assert.ok(!roles.includes(UserRole.ATTENDANCE_SCANNER), method);
      assert.equal(guardAllows(roles, UserRole.ATTENDANCE_SCANNER), false, method);
    }
  });

  it('activity endpoints deny ATTENDANCE_SCANNER', () => {
    const activity = new ActivityController({} as any);
    for (const method of ['recent', 'timeline'] as const) {
      const roles = rolesOn(activity, method);
      assert.ok(roles.length > 0, method);
      assert.ok(!roles.includes(UserRole.ATTENDANCE_SCANNER), method);
      assert.equal(guardAllows(roles, UserRole.ATTENDANCE_SCANNER), false, method);
      assert.equal(guardAllows(roles, UserRole.SCHOOL_ADMIN), true, method);
    }
  });
});

describe('ATTENDANCE_SCANNER denied on other module controllers', () => {
  it('students / teachers / fees / users / reports role lists exclude scanner', async () => {
    const { StudentsController } = await import('../students/students.controller');
    const { TeachersController } = await import('../teachers/teachers.controller');
    const { FeesController } = await import('../fees/fees.controller');
    const { UsersController } = await import('../users/users.controller');
    const { ReportsController } = await import('../reports/reports.controller');
    const { SchoolsController } = await import('../schools/schools.controller');

    const samples: Array<{ ctrl: object; methods: string[] }> = [
      {
        ctrl: new StudentsController({} as any),
        methods: ['findAll', 'create', 'update', 'remove'].filter((m) =>
          typeof (StudentsController.prototype as any)[m] === 'function',
        ),
      },
      {
        ctrl: new TeachersController({} as any),
        methods: Object.getOwnPropertyNames(TeachersController.prototype).filter(
          (m) => m !== 'constructor' && typeof (TeachersController.prototype as any)[m] === 'function',
        ),
      },
      {
        ctrl: new FeesController({} as any),
        methods: Object.getOwnPropertyNames(FeesController.prototype).filter(
          (m) => m !== 'constructor' && typeof (FeesController.prototype as any)[m] === 'function',
        ),
      },
      {
        ctrl: new UsersController({} as any),
        methods: Object.getOwnPropertyNames(UsersController.prototype).filter(
          (m) => m !== 'constructor' && typeof (UsersController.prototype as any)[m] === 'function',
        ),
      },
      {
        ctrl: new ReportsController({} as any),
        methods: Object.getOwnPropertyNames(ReportsController.prototype).filter(
          (m) => m !== 'constructor' && typeof (ReportsController.prototype as any)[m] === 'function',
        ),
      },
      {
        ctrl: new SchoolsController({} as any),
        methods: Object.getOwnPropertyNames(SchoolsController.prototype).filter(
          (m) => m !== 'constructor' && typeof (SchoolsController.prototype as any)[m] === 'function',
        ),
      },
    ];

    for (const { ctrl, methods } of samples) {
      for (const method of methods) {
        const roles = rolesOn(ctrl, method);
        if (!roles.length) continue; // no @Roles → not a protected module route of interest
        assert.ok(
          !roles.includes(UserRole.ATTENDANCE_SCANNER),
          `${ctrl.constructor.name}.${method} must not allow ATTENDANCE_SCANNER`,
        );
      }
    }
  });
});
