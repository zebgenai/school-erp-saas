import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IdCardTemplate } from '@prisma/client';
import { mapTeacherIdCardView, missingPhotoTeachers } from './teacher-card-payload';

const school = {
  id: 'school-a',
  name: 'Iqra',
  logoUrl: '/uploads/logo.png',
  themeColor: '#0f766e',
  address: 'Lahore',
  phone: '0300',
  email: 'a@b.c',
  domain: null,
  idCardTemplate: IdCardTemplate.CLASSIC,
};

const teacher = {
  id: 'teacher-1',
  fullName: 'Ali Teacher',
  employeeNo: 'EMP-01',
  designation: 'Senior Teacher',
  photoUrl: '/uploads/ali.png',
  status: 'ACTIVE',
};

describe('mapTeacherIdCardView', () => {
  it('includes employeeNo, designation, photo and no occupation field', () => {
    const view = mapTeacherIdCardView({
      teacher,
      school,
      card: {
        id: 'card-1',
        qrToken: 'TCC1.abcdefghijklmnopqrstuvwxyz0123456789ABCD',
        isActive: true,
        issuedAt: new Date('2026-09-26T00:00:00.000Z'),
        revokedAt: null,
      },
    });

    assert.equal(view.teacher.fullName, 'Ali Teacher');
    assert.equal(view.teacher.employeeNo, 'EMP-01');
    assert.equal(view.teacher.designation, 'Senior Teacher');
    assert.equal(view.teacher.photoUrl, '/uploads/ali.png');
    assert.equal(view.hasPhoto, true);
    assert.equal(view.card.reference, 'EMP-01');
    assert.equal(view.card.status, 'ACTIVE');
    assert.equal(view.school.name, 'Iqra');
    assert.equal(view.school.logoUrl, '/uploads/logo.png');
    assert.equal(view.school.teacherCardColors.primary, '#115e59');
    assert.equal('occupation' in view.teacher, false);
    assert.equal((view as any).occupation, undefined);
  });

  it('uses custom teacher card colors from the school when present', () => {
    const view = mapTeacherIdCardView({
      teacher,
      school: {
        ...school,
        teacherIdCardPrimaryColor: '#006666',
        teacherIdCardAccentColor: '#00aaaa',
        teacherIdCardBackgroundColor: '#f5f5f5',
        teacherIdCardTextColor: '#111111',
      },
      card: {
        id: 'card-1',
        qrToken: 'TCC1.abcdefghijklmnopqrstuvwxyz0123456789ABCD',
        isActive: true,
        issuedAt: new Date(),
        revokedAt: null,
      },
    });
    assert.equal(view.school.teacherCardColors.primary, '#006666');
    assert.equal(view.school.teacherCardColors.accent, '#00aaaa');
    assert.equal(view.school.teacherCardColors.background, '#f5f5f5');
    assert.equal(view.school.teacherCardColors.text, '#111111');
  });

  it('supports teachers without a photo and remaps live photoUrl', () => {
    const without = mapTeacherIdCardView({
      teacher: { ...teacher, photoUrl: null },
      school,
      card: {
        id: 'card-2',
        qrToken: 'TCC1.abcdefghijklmnopqrstuvwxyz0123456789EFGH',
        isActive: true,
        issuedAt: new Date(),
        revokedAt: null,
      },
    });
    assert.equal(without.hasPhoto, false);
    assert.equal(without.teacher.photoUrl, null);

    const updated = mapTeacherIdCardView({
      teacher: { ...teacher, photoUrl: '/uploads/new.png' },
      school,
      card: {
        id: 'card-2',
        qrToken: without.qrToken,
        isActive: true,
        issuedAt: new Date(),
        revokedAt: null,
      },
    });
    assert.equal(updated.teacher.photoUrl, '/uploads/new.png');
    assert.equal(updated.hasPhoto, true);
  });

  it('missingPhotoTeachers lists teachers lacking photos', () => {
    const withPhoto = mapTeacherIdCardView({
      teacher,
      school,
      card: {
        id: 'c1',
        qrToken: 'TCC1.abcdefghijklmnopqrstuvwxyz0123456789AAAA',
        isActive: true,
        issuedAt: new Date(),
      },
    });
    const noPhoto = mapTeacherIdCardView({
      teacher: { ...teacher, id: 't2', fullName: 'No Photo', photoUrl: null },
      school,
      card: {
        id: 'c2',
        qrToken: 'TCC1.abcdefghijklmnopqrstuvwxyz0123456789BBBB',
        isActive: true,
        issuedAt: new Date(),
      },
    });
    const missing = missingPhotoTeachers([withPhoto, noPhoto]);
    assert.equal(missing.length, 1);
    assert.equal(missing[0].id, 't2');
  });
});
