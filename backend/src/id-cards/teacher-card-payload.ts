import { IdCardTemplate } from '@prisma/client';
import {
  resolveTeacherIdCardColors,
  type TeacherIdCardColors,
} from './teacher-id-card-colors';

export type TeacherCardSource = {
  id: string;
  fullName: string;
  employeeNo?: string | null;
  designation?: string | null;
  photoUrl?: string | null;
  status: string;
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
  teacherIdCardPrimaryColor?: string | null;
  teacherIdCardAccentColor?: string | null;
  teacherIdCardBackgroundColor?: string | null;
  teacherIdCardTextColor?: string | null;
};

export type TeacherCardRecordSource = {
  id: string;
  qrToken: string;
  isActive: boolean;
  issuedAt: Date;
  revokedAt?: Date | null;
};

export type TeacherIdCardView = {
  card: {
    id: string;
    isActive: boolean;
    issuedAt: string;
    revokedAt: string | null;
    reference: string;
    status: 'ACTIVE' | 'REVOKED' | 'NONE';
  };
  teacher: {
    id: string;
    fullName: string;
    employeeNo: string | null;
    designation: string | null;
    photoUrl: string | null;
    status: string;
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
    /** Resolved teacher-card design colors (never null — defaults applied). */
    teacherCardColors: TeacherIdCardColors;
  };
  template: IdCardTemplate;
  qrToken: string;
  qrSvg?: string;
  hasPhoto: boolean;
  /** False for read-only preview of teachers who have no issued card. */
  cardExists: boolean;
};

export function mapTeacherIdCardView(input: {
  teacher: TeacherCardSource;
  school: SchoolCardSource;
  card: TeacherCardRecordSource;
  template?: IdCardTemplate;
  qrSvg?: string;
  cardExists?: boolean;
}): TeacherIdCardView {
  const { teacher, school, card } = input;
  const cardExists = input.cardExists ?? Boolean(card.id && card.qrToken);
  const status: TeacherIdCardView['card']['status'] = !cardExists
    ? 'NONE'
    : card.isActive
      ? 'ACTIVE'
      : 'REVOKED';

  return {
    card: {
      id: card.id,
      isActive: card.isActive,
      issuedAt: card.issuedAt.toISOString(),
      revokedAt: card.revokedAt ? card.revokedAt.toISOString() : null,
      reference: teacher.employeeNo?.trim() || teacher.id.slice(0, 8).toUpperCase(),
      status,
    },
    teacher: {
      id: teacher.id,
      fullName: teacher.fullName,
      employeeNo: teacher.employeeNo ?? null,
      designation: teacher.designation ?? null,
      photoUrl: teacher.photoUrl ?? null,
      status: teacher.status,
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
      teacherCardColors: resolveTeacherIdCardColors(school),
    },
    template: input.template ?? school.idCardTemplate ?? IdCardTemplate.CLASSIC,
    qrToken: card.qrToken,
    qrSvg: input.qrSvg,
    hasPhoto: Boolean(teacher.photoUrl),
    cardExists,
  };
}

export function missingPhotoTeachers(cards: TeacherIdCardView[]) {
  return cards
    .filter((card) => !card.hasPhoto)
    .map((card) => ({
      id: card.teacher.id,
      fullName: card.teacher.fullName,
      employeeNo: card.teacher.employeeNo,
    }));
}
