import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deleteSchoolWithDependents,
  SCHOOL_SCOPED_DELETE_MANY_MODELS,
} from './delete-school';

type TxCall = { model: string; op: string; args: Record<string, unknown> };

function createMockTx(failOn?: { model: string; op: string }) {
  const calls: TxCall[] = [];
  const tx = new Proxy(
    {},
    {
      get(_target, model: string) {
        return new Proxy(
          {},
          {
            get(_inner, op: string) {
              return async (args: Record<string, unknown>) => {
                if (failOn && failOn.model === model && failOn.op === op) {
                  throw new Error(`forced failure: ${model}.${op}`);
                }
                calls.push({ model, op, args });
                return { count: 0 };
              };
            },
          },
        );
      },
    },
  );
  return { tx: tx as any, calls };
}

describe('deleteSchoolWithDependents', () => {
  it('deletes dependents in order and the school last, scoped to schoolId', async () => {
    const schoolId = 'school-to-delete';
    const otherId = 'other-school';
    const { tx, calls } = createMockTx();

    await deleteSchoolWithDependents(tx, schoolId);

    const deleteMany = calls.filter((c) => c.op === 'deleteMany');
    assert.deepEqual(
      deleteMany.map((c) => c.model),
      [...SCHOOL_SCOPED_DELETE_MANY_MODELS],
    );
    for (const call of deleteMany) {
      assert.deepEqual(call.args.where, { schoolId });
      assert.notEqual((call.args.where as { schoolId: string }).schoolId, otherId);
    }

    const updates = calls.filter((c) => c.op === 'updateMany');
    assert.ok(updates.length >= 3);
    for (const call of updates) {
      assert.equal((call.args.where as { schoolId: string }).schoolId, schoolId);
    }

    const schoolDelete = calls.filter((c) => c.model === 'school' && c.op === 'delete');
    assert.equal(schoolDelete.length, 1);
    assert.deepEqual(schoolDelete[0].args.where, { id: schoolId });
    assert.equal(calls.at(-1)?.model, 'school');
    assert.equal(calls.at(-1)?.op, 'delete');
  });

  it('deletes SchoolAuditLog before users and before the school', async () => {
    const { tx, calls } = createMockTx();
    await deleteSchoolWithDependents(tx, 'school-audit');

    const names = calls.filter((c) => c.op === 'deleteMany' || c.op === 'delete').map((c) => c.model);
    const auditIdx = names.indexOf('schoolAuditLog');
    const userIdx = names.indexOf('user');
    const schoolIdx = names.lastIndexOf('school');
    assert.ok(auditIdx >= 0);
    assert.ok(auditIdx < userIdx);
    assert.ok(userIdx < schoolIdx);
  });

  it('rolls back later steps when a delete fails', async () => {
    const { tx, calls } = createMockTx({ model: 'schoolAuditLog', op: 'deleteMany' });

    await assert.rejects(
      () => deleteSchoolWithDependents(tx, 'school-fail'),
      /forced failure: schoolAuditLog.deleteMany/,
    );

    assert.equal(calls.some((c) => c.model === 'user' && c.op === 'deleteMany'), false);
    assert.equal(calls.some((c) => c.model === 'school' && c.op === 'delete'), false);
  });
});
