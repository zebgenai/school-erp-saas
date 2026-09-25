import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeOptionalText,
  pickCanonicalParent,
  syncFatherParent,
  type ParentCandidate,
} from './father-parent-sync';

function parent(
  overrides: Partial<ParentCandidate> & Pick<ParentCandidate, 'id'>,
): ParentCandidate {
  return {
    schoolId: 'school-a',
    studentId: 'stu-1',
    fullName: 'Old Father',
    phone: null,
    email: 'keep@example.com',
    address: 'Existing address',
    status: 'ACTIVE',
    userId: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('normalizeOptionalText', () => {
  it('trims and treats blank as null', () => {
    assert.equal(normalizeOptionalText('  Ali  '), 'Ali');
    assert.equal(normalizeOptionalText('   '), null);
    assert.equal(normalizeOptionalText(null), null);
    assert.equal(normalizeOptionalText(undefined), null);
  });
});

describe('pickCanonicalParent', () => {
  it('prefers ACTIVE parent with matching phone', () => {
    const chosen = pickCanonicalParent(
      [
        parent({ id: 'p1', phone: '111', createdAt: new Date('2026-01-01') }),
        parent({ id: 'p2', phone: '222', createdAt: new Date('2026-01-02') }),
        parent({
          id: 'p3',
          phone: '222',
          status: 'INACTIVE',
          createdAt: new Date('2026-01-03'),
        }),
      ],
      '222',
    );
    assert.equal(chosen?.id, 'p2');
  });

  it('falls back to earliest ACTIVE parent when phone does not match', () => {
    const chosen = pickCanonicalParent(
      [
        parent({ id: 'p1', phone: '111', createdAt: new Date('2026-01-02') }),
        parent({ id: 'p2', phone: '333', createdAt: new Date('2026-01-01') }),
        parent({
          id: 'p3',
          status: 'INACTIVE',
          createdAt: new Date('2025-01-01'),
        }),
      ],
      '999',
    );
    assert.equal(chosen?.id, 'p2');
  });

  it('falls back to earliest linked parent when none are ACTIVE', () => {
    const chosen = pickCanonicalParent(
      [
        parent({
          id: 'p1',
          status: 'INACTIVE',
          createdAt: new Date('2026-01-02'),
        }),
        parent({
          id: 'p2',
          status: 'INACTIVE',
          createdAt: new Date('2026-01-01'),
        }),
      ],
      '111',
    );
    assert.equal(chosen?.id, 'p2');
  });

  it('returns null when no parents are linked', () => {
    assert.equal(pickCanonicalParent([], '111'), null);
  });
});

describe('syncFatherParent', () => {
  it('creates one parent when fatherName is present and none exist', async () => {
    const created: any[] = [];
    const tx = {
      parent: {
        findMany: async () => [],
        create: async ({ data }: any) => {
          created.push(data);
          return { id: 'new-parent', ...data };
        },
        update: async () => {
          throw new Error('update should not be called');
        },
      },
    };

    await syncFatherParent(tx as any, {
      id: 'stu-1',
      schoolId: 'school-a',
      fatherName: 'Hassan Khan',
      guardianPhone: '03001234567',
      address: 'Charsadda',
    });

    assert.equal(created.length, 1);
    assert.equal(created[0].fullName, 'Hassan Khan');
    assert.equal(created[0].phone, '03001234567');
    assert.equal(created[0].studentId, 'stu-1');
    assert.equal(created[0].schoolId, 'school-a');
    assert.equal(created[0].address, 'Charsadda');
    assert.equal(created[0].status, 'ACTIVE');
  });

  it('creates no parent when fatherName is empty', async () => {
    let findCalled = false;
    const tx = {
      parent: {
        findMany: async () => {
          findCalled = true;
          return [];
        },
        create: async () => {
          throw new Error('create should not be called');
        },
        update: async () => {
          throw new Error('update should not be called');
        },
      },
    };

    const result = await syncFatherParent(tx as any, {
      id: 'stu-1',
      schoolId: 'school-a',
      fatherName: '   ',
      guardianPhone: '03001234567',
    });

    assert.equal(result, null);
    assert.equal(findCalled, false);
  });

  it('updates canonical parent without creating a duplicate', async () => {
    const updates: any[] = [];
    const existing = parent({
      id: 'p1',
      phone: '111',
      email: 'keep@example.com',
      userId: 'user-1',
      address: 'Keep me',
      status: 'ACTIVE',
    });
    const tx = {
      parent: {
        findMany: async () => [existing],
        create: async () => {
          throw new Error('create should not be called');
        },
        update: async ({ where, data }: any) => {
          updates.push({ where, data });
          return { ...existing, ...data };
        },
      },
    };

    await syncFatherParent(tx as any, {
      id: 'stu-1',
      schoolId: 'school-a',
      fatherName: 'New Father Name',
      guardianPhone: '03009999999',
      address: 'Should not overwrite',
    });

    assert.equal(updates.length, 1);
    assert.equal(updates[0].where.id, 'p1');
    assert.equal(updates[0].data.fullName, 'New Father Name');
    assert.equal(updates[0].data.phone, '03009999999');
    assert.equal(updates[0].data.address, undefined);
    assert.equal(updates[0].data.email, undefined);
    assert.equal(updates[0].data.userId, undefined);
    assert.equal(updates[0].data.status, undefined);
  });

  it('updates phone on the canonical parent', async () => {
    const updates: any[] = [];
    const existing = parent({ id: 'p1', phone: 'old-phone' });
    const tx = {
      parent: {
        findMany: async () => [existing],
        create: async () => {
          throw new Error('create should not be called');
        },
        update: async ({ data }: any) => {
          updates.push(data);
          return { ...existing, ...data };
        },
      },
    };

    await syncFatherParent(tx as any, {
      id: 'stu-1',
      schoolId: 'school-a',
      fatherName: 'Hassan Khan',
      guardianPhone: 'new-phone',
    });

    assert.equal(updates[0].phone, 'new-phone');
  });

  it('does not increase parent count on repeated sync (update path)', async () => {
    let createCount = 0;
    let updateCount = 0;
    const existing = parent({ id: 'p1', phone: '111' });
    const tx = {
      parent: {
        findMany: async () => [existing],
        create: async () => {
          createCount += 1;
          return existing;
        },
        update: async ({ data }: any) => {
          updateCount += 1;
          Object.assign(existing, data);
          return existing;
        },
      },
    };

    const student = {
      id: 'stu-1',
      schoolId: 'school-a',
      fatherName: 'Hassan Khan',
      guardianPhone: '111',
    };
    await syncFatherParent(tx as any, student);
    await syncFatherParent(tx as any, student);
    await syncFatherParent(tx as any, { ...student, fatherName: 'Hassan Khan Updated' });

    assert.equal(createCount, 0);
    assert.equal(updateCount, 3);
  });

  it('uses canonical rule when multiple parents exist and preserves others', async () => {
    const updates: any[] = [];
    const parents = [
      parent({ id: 'early', phone: '000', createdAt: new Date('2026-01-01') }),
      parent({ id: 'match', phone: '555', createdAt: new Date('2026-01-05') }),
      parent({ id: 'other', phone: '999', createdAt: new Date('2026-01-03') }),
    ];
    const tx = {
      parent: {
        findMany: async () => parents,
        create: async () => {
          throw new Error('create should not be called');
        },
        update: async ({ where, data }: any) => {
          updates.push({ where, data });
          return { ...parents.find((p) => p.id === where.id)!, ...data };
        },
      },
    };

    await syncFatherParent(tx as any, {
      id: 'stu-1',
      schoolId: 'school-a',
      fatherName: 'Canonical Father',
      guardianPhone: '555',
    });

    assert.equal(updates.length, 1);
    assert.equal(updates[0].where.id, 'match');
    assert.equal(parents.filter((p) => p.id !== 'match').length, 2);
  });

  it('does nothing destructive when fatherName is cleared', async () => {
    const tx = {
      parent: {
        findMany: async () => {
          throw new Error('findMany should not run when fatherName is cleared');
        },
        create: async () => {
          throw new Error('create should not be called');
        },
        update: async () => {
          throw new Error('update should not be called');
        },
        delete: async () => {
          throw new Error('delete should not be called');
        },
      },
    };

    const result = await syncFatherParent(tx as any, {
      id: 'stu-1',
      schoolId: 'school-a',
      fatherName: '',
      guardianPhone: '111',
    });
    assert.equal(result, null);
  });

  it('rejects sync when canonical parent belongs to another school', async () => {
    const tx = {
      parent: {
        // Query is school-scoped; simulate a bad row slipping through.
        findMany: async () => [
          parent({ id: 'p1', schoolId: 'school-b' }),
        ],
        create: async () => {
          throw new Error('create should not be called');
        },
        update: async () => {
          throw new Error('update should not be called');
        },
      },
    };

    await assert.rejects(
      () =>
        syncFatherParent(tx as any, {
          id: 'stu-1',
          schoolId: 'school-a',
          fatherName: 'Hassan',
          guardianPhone: '111',
        }),
      /school boundaries/i,
    );
  });

  it('fills empty parent address from student address only', async () => {
    const updates: any[] = [];
    const existing = parent({ id: 'p1', address: null });
    const tx = {
      parent: {
        findMany: async () => [existing],
        create: async () => {
          throw new Error('create should not be called');
        },
        update: async ({ data }: any) => {
          updates.push(data);
          return { ...existing, ...data };
        },
      },
    };

    await syncFatherParent(tx as any, {
      id: 'stu-1',
      schoolId: 'school-a',
      fatherName: 'Hassan',
      guardianPhone: '111',
      address: 'New Town',
    });

    assert.equal(updates[0].address, 'New Town');
  });
});
