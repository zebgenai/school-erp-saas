import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  DEFAULT_TEACHER_ID_CARD_COLORS,
  isValidHexColor,
  normalizeHexColor,
  resolveTeacherIdCardColors,
  teacherCardPalette,
} from './teacher-id-card-colors';
import { TeacherIdCardsService } from './teacher-id-cards.service';
import {
  TEACHER_ID_CARD_HEIGHT,
  TEACHER_ID_CARD_WIDTH,
} from '../pdf/templates/teacher-id-card.template';
import { ID_CARD_HEIGHT, ID_CARD_WIDTH } from '../pdf/templates/id-card.template';

const schoolA = 'school-a';
const schoolB = 'school-b';

const adminA = {
  id: 'admin-a',
  email: 'a@test',
  name: 'Admin A',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: schoolA,
};

const adminB = {
  id: 'admin-b',
  email: 'b@test',
  name: 'Admin B',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: schoolB,
};

const superAdmin = {
  id: 'sa',
  email: 'sa@test',
  name: 'SA',
  role: UserRole.SUPER_ADMIN,
  schoolId: null as string | null,
};

describe('teacher ID card colors helpers', () => {
  it('accepts #RGB and #RRGGBB and rejects invalid values', () => {
    assert.equal(isValidHexColor('#0f766e'), true);
    assert.equal(isValidHexColor('#abc'), true);
    assert.equal(isValidHexColor('red'), false);
    assert.equal(isValidHexColor('#gg0000'), false);
    assert.equal(normalizeHexColor('#abc'), '#aabbcc');
    assert.equal(normalizeHexColor('#0F766E'), '#0f766e');
  });

  it('returns teal defaults when school has no custom colors', () => {
    assert.deepEqual(resolveTeacherIdCardColors(null), DEFAULT_TEACHER_ID_CARD_COLORS);
    assert.deepEqual(resolveTeacherIdCardColors({}), DEFAULT_TEACHER_ID_CARD_COLORS);
  });

  it('uses valid custom colors and ignores invalid stored values', () => {
    const colors = resolveTeacherIdCardColors({
      teacherIdCardPrimaryColor: '#123456',
      teacherIdCardAccentColor: 'nope',
      teacherIdCardBackgroundColor: '#fff',
      teacherIdCardTextColor: '#111111',
    });
    assert.equal(colors.primary, '#123456');
    assert.equal(colors.accent, DEFAULT_TEACHER_ID_CARD_COLORS.accent);
    assert.equal(colors.background, '#ffffff');
    assert.equal(colors.text, '#111111');
  });

  it('teacherCardPalette keeps template structure with configured colors', () => {
    const colors = DEFAULT_TEACHER_ID_CARD_COLORS;
    const classic = teacherCardPalette('CLASSIC', colors);
    assert.equal(classic.header, colors.primary);
    assert.equal(classic.accent, colors.accent);
    const modern = teacherCardPalette('MODERN', { ...colors, primary: '#006666' });
    assert.equal(modern.header, '#006666');
  });
});

describe('teacher vs student PDF dimensions', () => {
  it('teacher PDF is portrait CR80 and student remains landscape', () => {
    assert.ok(TEACHER_ID_CARD_HEIGHT > TEACHER_ID_CARD_WIDTH);
    assert.ok(ID_CARD_WIDTH > ID_CARD_HEIGHT);
    assert.notEqual(TEACHER_ID_CARD_WIDTH, ID_CARD_WIDTH);
    assert.notEqual(TEACHER_ID_CARD_HEIGHT, ID_CARD_HEIGHT);
  });
});

describe('TeacherIdCardsService settings tenancy', () => {
  it('returns defaults when no custom colors are stored', async () => {
    const svc = new TeacherIdCardsService({
      school: {
        findUnique: async () => ({
          id: schoolA,
          teacherIdCardPrimaryColor: null,
          teacherIdCardAccentColor: null,
          teacherIdCardBackgroundColor: null,
          teacherIdCardTextColor: null,
        }),
      },
    } as any);
    const res = await svc.getTeacherSettings(adminA as any);
    assert.deepEqual(res.colors, DEFAULT_TEACHER_ID_CARD_COLORS);
    assert.equal(res.isCustom, false);
  });

  it('saves valid HEX colors for the admin school', async () => {
    let updated: any = null;
    const svc = new TeacherIdCardsService({
      school: {
        findUnique: async () => ({ id: schoolA }),
        update: async ({ data }: any) => {
          updated = data;
          return { id: schoolA, ...data };
        },
      },
    } as any);
    const res = await svc.updateTeacherSettings(
      {
        primaryColor: '#0d9488',
        accentColor: '#14b8a6',
        backgroundColor: '#ffffff',
        textColor: '#134e4a',
      },
      adminA as any,
    );
    assert.equal(updated.teacherIdCardPrimaryColor, '#0d9488');
    assert.equal(res.colors.primary, '#0d9488');
  });

  it('rejects invalid HEX at service level', async () => {
    const svc = new TeacherIdCardsService({
      school: { findUnique: async () => ({ id: schoolA }) },
    } as any);
    await assert.rejects(
      () =>
        svc.updateTeacherSettings(
          { primaryColor: 'not-a-color' } as any,
          adminA as any,
        ),
      BadRequestException,
    );
  });

  it('School A cannot update School B settings', async () => {
    const svc = new TeacherIdCardsService({} as any);
    await assert.rejects(
      () =>
        svc.updateTeacherSettings(
          { primaryColor: '#123456', schoolId: schoolB },
          adminA as any,
        ),
      ForbiddenException,
    );
  });

  it('SUPER_ADMIN requires schoolId and can update selected school', async () => {
    const svcMissing = new TeacherIdCardsService({} as any);
    await assert.rejects(
      () => svcMissing.getTeacherSettings(superAdmin as any),
      /schoolId/i,
    );

    let updatedId = '';
    const svc = new TeacherIdCardsService({
      school: {
        findUnique: async ({ where }: any) => ({ id: where.id }),
        update: async ({ where, data }: any) => {
          updatedId = where.id;
          return { id: where.id, ...data };
        },
      },
    } as any);
    await svc.updateTeacherSettings(
      { primaryColor: '#abcdef', schoolId: schoolB },
      superAdmin as any,
    );
    assert.equal(updatedId, schoolB);
  });

  it('SUPER_ADMIN loads settings for the explicitly selected school only', async () => {
    let requestedId = '';
    const svc = new TeacherIdCardsService({
      school: {
        findUnique: async ({ where }: any) => {
          requestedId = where.id;
          return {
            id: where.id,
            teacherIdCardPrimaryColor: where.id === schoolB ? '#006666' : '#111111',
            teacherIdCardAccentColor: null,
            teacherIdCardBackgroundColor: null,
            teacherIdCardTextColor: null,
          };
        },
      },
    } as any);
    const res = await svc.getTeacherSettings(superAdmin as any, schoolB);
    assert.equal(requestedId, schoolB);
    assert.equal(res.schoolId, schoolB);
    assert.equal(res.colors.primary, '#006666');
  });

  it('SUPER_ADMIN reset targets the selected schoolId', async () => {
    let resetId = '';
    const svc = new TeacherIdCardsService({
      school: {
        findUnique: async ({ where }: any) => ({ id: where.id }),
        update: async ({ where, data }: any) => {
          resetId = where.id;
          return {
            id: where.id,
            teacherIdCardPrimaryColor: null,
            teacherIdCardAccentColor: null,
            teacherIdCardBackgroundColor: null,
            teacherIdCardTextColor: null,
            ...data,
          };
        },
      },
    } as any);
    const res = await svc.resetTeacherSettings(superAdmin as any, schoolB);
    assert.equal(resetId, schoolB);
    assert.equal(res.schoolId, schoolB);
    assert.equal(res.isCustom, false);
  });

  it('SCHOOL_ADMIN get/update ignore foreign schoolId and stay on own school', async () => {
    let loadedId = '';
    const svc = new TeacherIdCardsService({
      school: {
        findUnique: async ({ where }: any) => {
          loadedId = where.id;
          return {
            id: where.id,
            teacherIdCardPrimaryColor: null,
            teacherIdCardAccentColor: null,
            teacherIdCardBackgroundColor: null,
            teacherIdCardTextColor: null,
          };
        },
        update: async ({ where, data }: any) => ({
          id: where.id,
          ...data,
        }),
      },
    } as any);
    // Own-school read
    const got = await svc.getTeacherSettings(adminA as any);
    assert.equal(loadedId, schoolA);
    assert.equal(got.schoolId, schoolA);

    // Attempting to pass another schoolId is forbidden (unchanged protection)
    await assert.rejects(
      () => svc.getTeacherSettings(adminA as any, schoolB),
      ForbiddenException,
    );
  });

  it('RECEPTIONIST cannot update teacher card settings', async () => {
    const svc = new TeacherIdCardsService({} as any);
    await assert.rejects(
      () =>
        svc.updateTeacherSettings(
          { primaryColor: '#123456' },
          { ...adminA, role: UserRole.RECEPTIONIST } as any,
        ),
      ForbiddenException,
    );
  });
});
