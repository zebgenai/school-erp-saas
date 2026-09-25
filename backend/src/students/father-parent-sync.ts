import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type ParentCandidate = {
  id: string;
  schoolId: string;
  studentId: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  status: string;
  userId: string | null;
  createdAt: Date;
};

export type StudentFatherSource = {
  id: string;
  schoolId: string;
  fatherName?: string | null;
  guardianPhone?: string | null;
  address?: string | null;
};

/** Trim; empty/whitespace becomes null. */
export function normalizeOptionalText(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Canonical parent for father sync (deterministic):
 * 1) ACTIVE parent whose phone matches guardianPhone
 * 2) earliest ACTIVE parent
 * 3) earliest linked parent
 */
export function pickCanonicalParent(
  parents: ParentCandidate[],
  guardianPhone?: string | null,
): ParentCandidate | null {
  if (!parents.length) return null;

  const ordered = [...parents].sort((a, b) => {
    const t = a.createdAt.getTime() - b.createdAt.getTime();
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });

  const active = ordered.filter((p) => p.status === 'ACTIVE');
  const phone = normalizeOptionalText(guardianPhone);
  if (phone) {
    const match = active.find((p) => normalizeOptionalText(p.phone) === phone);
    if (match) return match;
  }
  if (active.length) return active[0];
  return ordered[0];
}

type Tx = Prisma.TransactionClient;

/**
 * Syncs Student father fields into exactly one canonical Parent.
 * - No fatherName → no-op (never deletes parents)
 * - Never overwrites email / userId / status
 * - Address only filled when parent address is empty
 * - Always scoped to the student's schoolId
 */
export async function syncFatherParent(tx: Tx, student: StudentFatherSource) {
  const fatherName = normalizeOptionalText(student.fatherName);
  if (!fatherName) return null;

  const linked = await tx.parent.findMany({
    where: { studentId: student.id, schoolId: student.schoolId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  const canonical = pickCanonicalParent(linked, student.guardianPhone);
  const phone = normalizeOptionalText(student.guardianPhone);
  const studentAddress = normalizeOptionalText(student.address);

  if (canonical) {
    if (canonical.schoolId !== student.schoolId) {
      throw new BadRequestException('Cannot sync parent across school boundaries');
    }

    const data: Prisma.ParentUpdateInput = {
      fullName: fatherName,
      phone,
    };

    if (!normalizeOptionalText(canonical.address) && studentAddress) {
      data.address = studentAddress;
    }

    return tx.parent.update({
      where: { id: canonical.id },
      data,
    });
  }

  return tx.parent.create({
    data: {
      schoolId: student.schoolId,
      studentId: student.id,
      fullName: fatherName,
      phone,
      address: studentAddress,
      status: 'ACTIVE',
    },
  });
}
