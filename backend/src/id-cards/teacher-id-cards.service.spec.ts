import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma, UserRole } from '@prisma/client';
import { TeacherIdCardsService } from './teacher-id-cards.service';
import { generateTeacherQrToken, QR_TEACHER_TOKEN_PREFIX } from './qr-token';

const schoolA = 'school-a';
const schoolB = 'school-b';
const admin = {
  id: 'u1',
  email: 'admin@test',
  name: 'Admin',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: schoolA,
};

const teacher = {
  id: 'teacher-a',
  schoolId: schoolA,
  fullName: 'Ali Teacher',
  employeeNo: 'EMP-01',
  designation: 'Senior',
  photoUrl: '/uploads/a.png',
  status: 'ACTIVE',
};

const schoolRow = {
  id: schoolA,
  name: 'Iqra',
  logoUrl: null,
  themeColor: '#0f766e',
  address: null,
  phone: null,
  email: null,
  domain: null,
  idCardTemplate: 'CLASSIC',
  timezone: 'Asia/Karachi',
};

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('Teacher ID card tenancy', () => {
  it('refuses to load a teacher from another school', async () => {
    const svc = new TeacherIdCardsService({
      teacher: {
        findUnique: async () => ({
          ...teacher,
          id: 'teacher-b',
          schoolId: schoolB,
          fullName: 'Other',
        }),
      },
    } as any);
    await assert.rejects(
      () => svc.getForTeacher('teacher-b', admin as any),
      /another school's data|does not belong/i,
    );
  });

  it('rejects cross-school token resolution', async () => {
    const token = generateTeacherQrToken();
    const svc = new TeacherIdCardsService({
      teacherIdCard: {
        findFirst: async () => ({
          id: 'card-1',
          qrToken: token,
          isActive: true,
          issuedAt: new Date(),
          revokedAt: null,
          schoolId: schoolB,
          teacher: { ...teacher, schoolId: schoolB },
        }),
      },
      school: { findUnique: async () => schoolRow },
    } as any);

    await assert.rejects(
      () => svc.resolveActiveByToken(token, schoolA),
      /another school's data|not found|inactive/i,
    );
  });
});

describe('Teacher ID card preview is read-only', () => {
  it('does not create a TeacherIdCard or mint a QR token', async () => {
    let creates = 0;
    const svc = new TeacherIdCardsService({
      teacher: { findMany: async () => [teacher] },
      teacherIdCard: {
        findFirst: async () => null,
        create: async () => {
          creates += 1;
          return {};
        },
      },
      school: { findUnique: async () => schoolRow },
    } as any);

    const result = await svc.preview({ allActive: true }, admin as any);
    assert.equal(creates, 0);
    assert.equal(result.cards.length, 1);
    assert.equal(result.cards[0].cardExists, false);
    assert.equal(result.cards[0].qrToken, '');
    assert.equal(result.pendingCount, 1);
  });
});

describe('Teacher ID card issue / reissue / revoke', () => {
  it('creates a card with a unique TCC1 QR token', async () => {
    const created: Array<Record<string, unknown>> = [];
    const svc = new TeacherIdCardsService({
      teacher: { findUnique: async () => teacher },
      teacherIdCard: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return {
            id: 'card-1',
            ...data,
            isActive: true,
            issuedAt: new Date(),
            revokedAt: null,
          };
        },
      },
      school: { findUnique: async () => schoolRow },
    } as any);

    const view = await svc.issue(teacher.id, admin as any);
    assert.equal(created.length, 1);
    assert.equal(String(created[0].qrToken).startsWith(QR_TEACHER_TOKEN_PREFIX), true);
    assert.equal(view.cardExists, true);
    assert.equal(view.teacher.employeeNo, 'EMP-01');
    assert.equal(view.teacher.designation, 'Senior');
    assert.equal(view.hasPhoto, true);
    assert.equal('occupation' in view.teacher, false);
  });

  it('supports teachers without photo', async () => {
    const noPhoto = { ...teacher, photoUrl: null };
    const svc = new TeacherIdCardsService({
      teacher: { findUnique: async () => noPhoto },
      teacherIdCard: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'card-1',
          ...data,
          isActive: true,
          issuedAt: new Date(),
          revokedAt: null,
        }),
      },
      school: { findUnique: async () => schoolRow },
    } as any);

    const view = await svc.issue(noPhoto.id, admin as any);
    assert.equal(view.hasPhoto, false);
    assert.equal(view.teacher.photoUrl, null);
  });

  it('reissue revokes previous and mints a new token', async () => {
    let revoked = false;
    const tokens: string[] = [];
    const svc = new TeacherIdCardsService({
      teacher: { findUnique: async () => teacher },
      $transaction: async (fn: any) =>
        fn({
          teacherIdCard: {
            updateMany: async () => {
              revoked = true;
              return { count: 1 };
            },
            create: async ({ data }: { data: { qrToken: string } }) => {
              tokens.push(data.qrToken);
              return {
                id: 'card-2',
                schoolId: schoolA,
                teacherId: teacher.id,
                qrToken: data.qrToken,
                isActive: true,
                issuedAt: new Date(),
                revokedAt: null,
              };
            },
          },
        }),
      school: { findUnique: async () => schoolRow },
    } as any);

    const view = await svc.reissue(teacher.id, admin as any);
    assert.equal(revoked, true);
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].startsWith(QR_TEACHER_TOKEN_PREFIX), true);
    assert.equal(view.cardExists, true);
  });

  it('revoke clears the active card', async () => {
    const svc = new TeacherIdCardsService({
      teacher: { findUnique: async () => teacher },
      teacherIdCard: {
        updateMany: async () => ({ count: 1 }),
      },
    } as any);
    const result = await svc.revoke(teacher.id, admin as any);
    assert.equal(result.revoked, 1);
  });

  it('rejects inactive / revoked cards on token resolve', async () => {
    const token = generateTeacherQrToken();
    const svc = new TeacherIdCardsService({
      teacherIdCard: {
        findFirst: async () => null,
      },
    } as any);
    await assert.rejects(() => svc.resolveActiveByToken(token, schoolA), /not found|inactive/i);

    const revokedSvc = new TeacherIdCardsService({
      teacherIdCard: {
        findFirst: async () => ({
          id: 'card-1',
          qrToken: token,
          isActive: true,
          issuedAt: new Date(),
          revokedAt: new Date(),
          schoolId: schoolA,
          teacher,
        }),
      },
      school: { findUnique: async () => schoolRow },
    } as any);
    await assert.rejects(
      () => revokedSvc.resolveActiveByToken(token, schoolA),
      /revoked/i,
    );
  });

  it('resolves an active teacher QR token', async () => {
    const token = generateTeacherQrToken();
    const svc = new TeacherIdCardsService({
      teacherIdCard: {
        findFirst: async ({ where }: any) => {
          assert.equal(where.qrToken, token);
          assert.equal(where.schoolId, schoolA);
          assert.equal(where.isActive, true);
          return {
            id: 'card-1',
            qrToken: token,
            isActive: true,
            issuedAt: new Date(),
            revokedAt: null,
            schoolId: schoolA,
            teacher,
          };
        },
      },
      school: { findUnique: async () => schoolRow },
    } as any);

    const view = await svc.resolveActiveByToken(token, schoolA);
    assert.equal(view.qrToken, token);
    assert.equal(view.teacher.id, teacher.id);
    assert.equal(view.cardExists, true);
  });

  it('concurrent create race returns the existing active card', async () => {
    const token = generateTeacherQrToken();
    let creates = 0;
    const svc = new TeacherIdCardsService({
      teacher: { findUnique: async () => teacher },
      teacherIdCard: {
        findFirst: async () =>
          creates === 0
            ? null
            : {
                id: 'card-winner',
                qrToken: token,
                isActive: true,
                issuedAt: new Date(),
                revokedAt: null,
              },
        create: async () => {
          creates += 1;
          throw p2002();
        },
      },
      school: { findUnique: async () => schoolRow },
    } as any);

    const view = await svc.issue(teacher.id, admin as any);
    assert.equal(creates, 1);
    assert.equal(view.card.id, 'card-winner');
    assert.equal(view.qrToken, token);
  });
});
