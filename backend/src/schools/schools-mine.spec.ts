import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { SchoolsService } from './schools.service';

const SCHOOL_INCLUDE = { subscription: { include: { plan: true } } };

describe('GET /schools/mine subscription include', () => {
  it('returns subscription and plan when assigned', async () => {
    let captured: unknown;
    const service = new SchoolsService({
      school: {
        findUnique: async (args: { where: { id: string }; include?: unknown }) => {
          captured = args.include;
          return {
            id: 'school-1',
            name: 'IQRA Smart School',
            subscription: {
              status: 'ACTIVE',
              startDate: new Date('2026-01-01'),
              endDate: new Date('2026-12-31'),
              plan: { name: 'Professional', tier: 'PROFESSIONAL' },
            },
          };
        },
      },
    } as any);

    const school = await service.findOne('school-1');
    assert.deepEqual(captured, SCHOOL_INCLUDE);
    assert.equal(school.subscription?.plan?.name, 'Professional');
    assert.equal(school.subscription?.status, 'ACTIVE');
    assert.ok(school.subscription?.endDate);
  });

  it('returns a school with no subscription without crashing', async () => {
    const service = new SchoolsService({
      school: {
        findUnique: async () => ({
          id: 'school-2',
          name: 'Allied School Tangi',
          subscription: null,
        }),
      },
    } as any);

    const school = await service.findOne('school-2');
    assert.equal(school.subscription, null);
  });

  it('throws when the school is missing', async () => {
    const service = new SchoolsService({
      school: { findUnique: async () => null },
    } as any);
    await assert.rejects(() => service.findOne('missing'), NotFoundException);
  });
});
