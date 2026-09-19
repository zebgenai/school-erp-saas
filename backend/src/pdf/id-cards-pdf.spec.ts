import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '@prisma/client';
import { IdCardsPdfDto } from './dto/id-cards-pdf.dto';
import { PdfService } from './pdf.service';

const admin = {
  id: 'u1',
  email: 'admin@test',
  name: 'Admin',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: 'school-a',
};

function sampleCard(id: string, schoolId = 'school-a') {
  return {
    card: {
      id: `card-${id}`,
      isActive: true,
      issuedAt: new Date().toISOString(),
      revokedAt: null,
      reference: id,
    },
    student: {
      id,
      fullName: `Student ${id}`,
      admissionNo: id,
      fatherName: null,
      photoUrl: null,
      status: 'ACTIVE',
      className: 'Five',
      sectionName: 'A',
    },
    school: {
      id: schoolId,
      name: 'Iqra',
      logoUrl: null,
      themeColor: null,
      address: null,
      phone: null,
      email: null,
      domain: null,
    },
    template: 'CLASSIC' as const,
    qrToken: '',
    hasPhoto: false,
    cardExists: false,
  };
}

function makePdfService(idCardsService: any) {
  return new PdfService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    idCardsService,
  );
}

describe('IdCardsPdfDto validation', () => {
  it('accepts allActive PDF requests', async () => {
    const dto = plainToInstance(IdCardsPdfDto, { allActive: true, template: 'CLASSIC' });
    assert.equal((await validate(dto)).length, 0);
    assert.equal(dto.allActive, true);
  });

  it('accepts single-student and class/section selections', async () => {
    const single = plainToInstance(IdCardsPdfDto, {
      studentIds: ['stu-1'],
      template: 'MODERN',
    });
    const byClass = plainToInstance(IdCardsPdfDto, {
      classId: 'class-1',
      sectionId: 'sec-1',
    });
    assert.equal((await validate(single)).length, 0);
    assert.equal((await validate(byClass)).length, 0);
  });

  it('DTO schema does not include non-whitelisted fields', () => {
    assert.equal(
      Object.prototype.hasOwnProperty.call(IdCardsPdfDto.prototype, 'evil'),
      false,
    );
    const dto = plainToInstance(IdCardsPdfDto, {
      allActive: true,
      cursor: 'x',
      template: 'CLASSIC',
    });
    assert.equal(dto.allActive, true);
    assert.equal(dto.cursor, 'x');
  });
});

describe('PdfService.generateIdCards', () => {
  it('accepts allActive and walks preview batches school-scoped', async () => {
    const previewCalls: any[] = [];
    const idCardsService = {
      preview: async (dto: any, user: any) => {
        previewCalls.push({ dto, schoolId: user.schoolId });
        assert.equal(user.schoolId, 'school-a');
        assert.equal(dto.allActive, true);
        if (!dto.cursor) {
          return {
            cards: [sampleCard('a1'), sampleCard('a2')],
            hasMore: true,
            nextCursor: 'a2',
            batchSize: 200,
          };
        }
        assert.equal(dto.cursor, 'a2');
        return {
          cards: [sampleCard('a3')],
          hasMore: false,
          nextCursor: undefined,
          batchSize: 200,
        };
      },
    };

    const result = await makePdfService(idCardsService).generateIdCards(
      { allActive: true } as any,
      admin as any,
    );

    assert.equal(previewCalls.length, 2);
    assert.ok(previewCalls.every((c) => c.schoolId === 'school-a'));
    assert.equal(result.filename, 'id-cards-3.pdf');
    assert.ok(Buffer.isBuffer(result.buffer));
    assert.ok(result.buffer.length > 0);
  });

  it('keeps single-student PDF as one preview page', async () => {
    let calls = 0;
    const idCardsService = {
      preview: async (dto: any) => {
        calls += 1;
        assert.deepEqual(dto.studentIds, ['stu-1']);
        return { cards: [sampleCard('stu-1')], hasMore: false, nextCursor: undefined };
      },
    };

    const result = await makePdfService(idCardsService).generateIdCards(
      { studentIds: ['stu-1'] } as any,
      admin as any,
    );
    assert.equal(calls, 1);
    assert.equal(result.filename, 'id-cards-1.pdf');
  });

  it('keeps class/section PDF selection shape', async () => {
    const idCardsService = {
      preview: async (dto: any) => {
        assert.equal(dto.classId, 'class-1');
        assert.equal(dto.sectionId, 'sec-1');
        assert.equal(dto.allActive, undefined);
        return { cards: [sampleCard('s1')], hasMore: false };
      },
    };
    const result = await makePdfService(idCardsService).generateIdCards(
      { classId: 'class-1', sectionId: 'sec-1' } as any,
      admin as any,
    );
    assert.ok(result.buffer.length > 0);
  });

  it('throws when no students match', async () => {
    const idCardsService = {
      preview: async () => ({ cards: [], hasMore: false }),
    };
    await assert.rejects(
      () =>
        makePdfService(idCardsService).generateIdCards({ allActive: true } as any, admin as any),
      BadRequestException,
    );
  });
});
