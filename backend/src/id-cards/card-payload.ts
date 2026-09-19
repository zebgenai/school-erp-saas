import { IdCardTemplate } from '@prisma/client';

export type StudentCardSource = {
  id: string;
  fullName: string;
  admissionNo: string;
  fatherName?: string | null;
  photoUrl?: string | null;
  status: string;
  class?: { name: string } | null;
  section?: { name: string } | null;
};

export type SchoolCardSource = {
  id: string;
  name: string;
  logoUrl?: string | null;
  themeColor?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  domain?: string | null;
  idCardTemplate?: IdCardTemplate | null;
};

export type CardRecordSource = {
  id: string;
  qrToken: string;
  isActive: boolean;
  issuedAt: Date;
  revokedAt?: Date | null;
};

export type IdCardView = {
  card: {
    id: string;
    isActive: boolean;
    issuedAt: string;
    revokedAt: string | null;
    reference: string;
  };
  student: {
    id: string;
    fullName: string;
    admissionNo: string;
    fatherName: string | null;
    photoUrl: string | null;
    status: string;
    className: string | null;
    sectionName: string | null;
  };
  school: {
    id: string;
    name: string;
    logoUrl: string | null;
    themeColor: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    domain: string | null;
  };
  template: IdCardTemplate;
  qrToken: string;
  qrSvg?: string;
  hasPhoto: boolean;
  /** False for read-only preview of students who have no issued card. */
  cardExists: boolean;
};

export function mapIdCardView(input: {
  student: StudentCardSource;
  school: SchoolCardSource;
  card: CardRecordSource;
  template?: IdCardTemplate;
  qrSvg?: string;
  cardExists?: boolean;
}): IdCardView {
  const { student, school, card } = input;
  return {
    card: {
      id: card.id,
      isActive: card.isActive,
      issuedAt: card.issuedAt.toISOString(),
      revokedAt: card.revokedAt ? card.revokedAt.toISOString() : null,
      reference: student.admissionNo,
    },
    student: {
      id: student.id,
      fullName: student.fullName,
      admissionNo: student.admissionNo,
      fatherName: student.fatherName ?? null,
      photoUrl: student.photoUrl ?? null,
      status: student.status,
      className: student.class?.name ?? null,
      sectionName: student.section?.name ?? null,
    },
    school: {
      id: school.id,
      name: school.name,
      logoUrl: school.logoUrl ?? null,
      themeColor: school.themeColor ?? null,
      address: school.address ?? null,
      phone: school.phone ?? null,
      email: school.email ?? null,
      domain: school.domain ?? null,
    },
    template: input.template ?? school.idCardTemplate ?? IdCardTemplate.CLASSIC,
    qrToken: card.qrToken,
    qrSvg: input.qrSvg,
    hasPhoto: Boolean(student.photoUrl),
    cardExists: input.cardExists ?? Boolean(card.id && card.qrToken),
  };
}

export function missingPhotoStudents(cards: IdCardView[]) {
  return cards
    .filter((card) => !card.hasPhoto)
    .map((card) => ({
      id: card.student.id,
      fullName: card.student.fullName,
      admissionNo: card.student.admissionNo,
    }));
}
