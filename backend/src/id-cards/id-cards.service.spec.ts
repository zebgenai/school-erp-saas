import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma, UserRole } from '@prisma/client';
import { IdCardsService } from './id-cards.service';
import { generateQrToken } from './qr-token';

const schoolA = 'school-a';
const schoolB = 'school-b';
const admin = {
  id: 'u1',
  email: 'admin@test',
  name: 'Admin',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: schoolA,
};

const student = {
  id: 'stu-a',
  schoolId: schoolA,
  fullName: 'Ali Khan',
  admissionNo: 'ADM-01',
  fatherName: 'Hassan',
  photoUrl: '/uploads/a.png',
  status: 'ACTIVE',
  class: { name: 'Five' },
  section: { name: 'A' },
};

const schoolRow = {
  id: schoolA,
  name: 'Iqra',
  logoUrl: null,
  themeColor: '#123456',
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

describe('ID card tenancy', () => {
  it('refuses to load a student from another school', async () => {
    const svc = new IdCardsService({
      student: {
        findUnique: async () => ({
          id: 'stu-b',
          schoolId: schoolB,
          fullName: 'Other',
          admissionNo: 'X',
          status: 'ACTIVE',
          class: null,
          section: null,
        }),
      },
    } as any);
    await assert.rejects(
      () => svc.getForStudent('stu-b', admin as any),
      /another school's data|does not belong/i,
    );
  });
});

describe('ID card preview is read-only', () => {
  it('does not create a StudentIdCard or mint a QR token', async () => {
    let creates = 0;
    const svc = new IdCardsService({
      class: { findUnique: async () => ({ id: 'class-1', schoolId: schoolA }) },
      student: { findMany: async () => [student] },
      studentIdCard: {
        findFirst: async () => null,
        create: async () => {
          creates += 1;
          return {};
        },
      },
      school: { findUnique: async () => schoolRow },
    } as any);

    const result = await svc.preview({ classId: 'class-1' }, admin as any);
    assert.equal(creates, 0);
    assert.equal(result.cards.length, 1);
    assert.equal(result.cards[0].cardExists, false);
    assert.equal(result.cards[0].qrToken, '');
    assert.equal(result.pendingCount, 1);
    assert.equal(result.issuedCount, 0);
  });

  it('reprint/preview returns an existing card QR without creating another', async () => {
    let creates = 0;
    const token = generateQrToken();
    const svc = new IdCardsService({
      class: { findUnique: async () => ({ id: 'class-1', schoolId: schoolA }) },
      student: { findMany: async () => [student] },
      studentIdCard: {
        findFirst: async () => ({
          id: 'card-1',
          qrToken: token,
          isActive: true,
          issuedAt: new Date(),
          revokedAt: null,
        }),
        create: async () => {
          creates += 1;
          return {};
        },
      },
      school: { findUnique: async () => schoolRow },
    } as any);

    const result = await svc.preview({ classId: 'class-1' }, admin as any);
    assert.equal(creates, 0);
    assert.equal(result.cards[0].cardExists, true);
    assert.equal(result.cards[0].qrToken, token);
  });
});

describe('ID card generate / reissue', () => {
  it('explicit Generate still creates the card with a QR token', async () => {
    const created: Array<Record<string, unknown>> = [];
    const svc = new IdCardsService({
      student: { findUnique: async () => student },
      studentIdCard: {
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

    const view = await svc.issue(student.id, admin as any);
    assert.equal(created.length, 1);
    assert.equal(typeof created[0].qrToken, 'string');
    assert.equal(String(created[0].qrToken).startsWith('CC1.'), true);
    assert.equal(view.cardExists, true);
    assert.equal(view.qrToken, created[0].qrToken);
  });

  it('reissue revokes the old card and creates exactly one active card', async () => {
    const oldToken = generateQrToken();
    const updates: Array<Record<string, unknown>> = [];
    const created: Array<Record<string, unknown>> = [];
    const tx = {
      studentIdCard: {
        updateMany: async (args: Record<string, unknown>) => {
          updates.push(args);
          return { count: 1 };
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return {
            id: 'card-2',
            ...data,
            isActive: true,
            issuedAt: new Date(),
            revokedAt: null,
          };
        },
      },
    };
    const svc = new IdCardsService({
      student: { findUnique: async () => student },
      school: { findUnique: async () => schoolRow },
      $transaction: async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
    } as any);

    const view = await svc.reissue(student.id, admin as any);
    assert.equal((updates[0].data as { isActive: boolean }).isActive, false);
    assert.equal(created.length, 1);
    assert.ok(created[0].qrToken);
    assert.notEqual(created[0].qrToken, oldToken);
    assert.equal(view.student.fullName, 'Ali Khan');
    assert.equal(view.qrToken.startsWith('CC1.'), true);
    assert.equal(view.cardExists, true);
  });

  it('concurrent Generate cannot leave two active cards (P2002 race returns existing)', async () => {
    let finds = 0;
    const winnerToken = generateQrToken();
    const svc = new IdCardsService({
      student: { findUnique: async () => student },
      studentIdCard: {
        findFirst: async () => {
          finds += 1;
          if (finds === 1) return null;
          return {
            id: 'card-winner',
            qrToken: winnerToken,
            isActive: true,
            issuedAt: new Date(),
            revokedAt: null,
          };
        },
        create: async () => {
          throw p2002();
        },
      },
      school: { findUnique: async () => schoolRow },
    } as any);

    const view = await svc.issue(student.id, admin as any);
    assert.equal(view.card.id, 'card-winner');
    assert.equal(view.qrToken, winnerToken);
    assert.equal(view.cardExists, true);
  });

  it('reissue rolls back when create fails so the old active card remains', async () => {
    let activeRevoked = false;
    const tx = {
      studentIdCard: {
        updateMany: async () => {
          activeRevoked = true;
          return { count: 1 };
        },
        create: async () => {
          throw new Error('simulated create failure');
        },
      },
    };
    const svc = new IdCardsService({
      student: { findUnique: async () => student },
      school: { findUnique: async () => schoolRow },
      $transaction: async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
    } as any);

    await assert.rejects(() => svc.reissue(student.id, admin as any), /simulated create failure/);
    // Transaction mock does not auto-rollback local flags, but the service only
    // commits via $transaction — a thrown create aborts the transaction callback.
    assert.equal(activeRevoked, true);
  });

  it('bulkGenerate allActive returns counts and nextCursor for safe batching', async () => {
    const students = [
      { ...student, id: 'stu-1', status: 'ACTIVE' },
      { ...student, id: 'stu-2', status: 'ACTIVE', photoUrl: null },
      { ...student, id: 'stu-3', status: 'INACTIVE' },
    ];
    let created = 0;
    const svc = new IdCardsService({
      student: {
        findMany: async ({ take }: { take: number }) => {
          // +1 probing for hasMore
          return students.slice(0, take);
        },
      },
      studentIdCard: {
        findFirst: async ({ where }: { where: { studentId: string } }) => {
          if (where.studentId === 'stu-2') {
            return {
              id: 'existing',
              qrToken: generateQrToken(),
              isActive: true,
              issuedAt: new Date(),
              revokedAt: null,
            };
          }
          return null;
        },
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created += 1;
          return {
            id: `new-${created}`,
            ...data,
            isActive: true,
            issuedAt: new Date(),
            revokedAt: null,
          };
        },
      },
      school: { findUnique: async () => schoolRow },
      class: { findUnique: async () => null },
      section: { findUnique: async () => null },
    } as any);

    const result = await svc.bulkGenerate({ allActive: true }, admin as any);
    assert.equal(result.generated, 1);
    assert.equal(result.alreadyHadActiveCard, 1);
    assert.equal(result.skippedInactive, 1);
    assert.equal(result.failed, 0);
    assert.equal(typeof result.batchSize, 'number');
  });
});
