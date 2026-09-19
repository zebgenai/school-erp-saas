import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { IdCardTemplate } from '@prisma/client';
import { mapIdCardView, missingPhotoStudents } from './card-payload';

describe('ID card payload mapping', () => {
  const student = {
    id: 'stu-1',
    fullName: 'Ali Khan',
    admissionNo: 'ADM-01',
    fatherName: 'Hassan Khan',
    photoUrl: '/uploads/ali.png',
    status: 'ACTIVE',
    class: { name: 'Five' },
    section: { name: 'A' },
  };
  const school = {
    id: 'school-a',
    name: 'Iqra Public School',
    logoUrl: '/uploads/logo.png',
    themeColor: '#1d4ed8',
    address: 'Charsadda',
    phone: '0300',
    email: 'info@iqra.test',
    domain: 'iqra.clevercampus.cloud',
    idCardTemplate: IdCardTemplate.CLASSIC,
  };
  const card = {
    id: 'card-1',
    qrToken: 'CC1.abcdefghijklmnopqrstuvwxyz012345',
    isActive: true,
    issuedAt: new Date('2026-09-17T00:00:00.000Z'),
    revokedAt: null,
  };

  it('uses live student and school fields instead of duplicated card copies', () => {
    const view = mapIdCardView({ student, school, card });
    assert.equal(view.student.fullName, 'Ali Khan');
    assert.equal(view.student.admissionNo, 'ADM-01');
    assert.equal(view.student.className, 'Five');
    assert.equal(view.student.sectionName, 'A');
    assert.equal(view.student.fatherName, 'Hassan Khan');
    assert.equal(view.student.photoUrl, '/uploads/ali.png');
    assert.equal(view.school.name, 'Iqra Public School');
    assert.equal(view.school.logoUrl, '/uploads/logo.png');
    assert.equal(view.school.themeColor, '#1d4ed8');
    assert.equal(view.card.reference, 'ADM-01');
    assert.equal(view.hasPhoto, true);
    assert.equal('cardStudentName' in view, false);
  });

  it('reflects class/name/photo changes on the next generate', () => {
    const updated = mapIdCardView({
      student: {
        ...student,
        fullName: 'Ali Khan Jr',
        photoUrl: '/uploads/ali-new.png',
        class: { name: 'Six' },
        section: { name: 'B' },
      },
      school,
      card,
    });
    assert.equal(updated.student.fullName, 'Ali Khan Jr');
    assert.equal(updated.student.className, 'Six');
    assert.equal(updated.student.sectionName, 'B');
    assert.equal(updated.student.photoUrl, '/uploads/ali-new.png');
  });

  it('lists students without photos', () => {
    const withPhoto = mapIdCardView({ student, school, card });
    const without = mapIdCardView({
      student: { ...student, id: 'stu-2', fullName: 'No Photo', photoUrl: null },
      school,
      card: { ...card, id: 'card-2' },
    });
    assert.deepEqual(missingPhotoStudents([withPhoto, without]), [
      { id: 'stu-2', fullName: 'No Photo', admissionNo: 'ADM-01' },
    ]);
  });
});
