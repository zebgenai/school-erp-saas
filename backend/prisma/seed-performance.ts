/**
 * Performance load-test seed for Clever Campus ERP.
 * Generates: 5,000 students, 500 teachers, 100 staff,
 * 50,000 attendance, 20,000 invoices, 10,000 payments.
 *
 * Usage: npx ts-node prisma/seed-performance.ts
 * WARNING: Run only on dev/staging databases.
 */
import { AttendanceStatus, FeeInvoiceStatus, Prisma, PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TARGETS = {
  students: 5000,
  teachers: 500,
  staff: 100,
  attendance: 50000,
  invoices: 20000,
  payments: 10000,
};

const BATCH = 500;

async function ensureSchool() {
  const password = await bcrypt.hash('PerfTest@123', 10);
  const school = await prisma.school.upsert({
    where: { slug: 'perf-test-school' },
    update: {},
    create: {
      name: 'Performance Test School',
      slug: 'perf-test-school',
      email: 'perf@test.com',
    },
  });

  await prisma.user.upsert({
    where: { email: 'perf-admin@test.com' },
    update: {},
    create: {
      schoolId: school.id,
      name: 'Perf Admin',
      email: 'perf-admin@test.com',
      password,
      role: UserRole.SCHOOL_ADMIN,
    },
  });

  const cls = await prisma.class.upsert({
    where: { schoolId_name: { schoolId: school.id, name: 'Class 10' } },
    update: {},
    create: { schoolId: school.id, name: 'Class 10' },
  });

  const section = await prisma.section.upsert({
    where: { schoolId_classId_name: { schoolId: school.id, classId: cls.id, name: 'A' } },
    update: {},
    create: { schoolId: school.id, classId: cls.id, name: 'A' },
  });

  return { school, cls, section };
}

async function seedTeachers(schoolId: string, count: number) {
  const existing = await prisma.teacher.count({ where: { schoolId } });
  const needed = Math.max(0, count - existing);
  console.log(`Teachers: existing=${existing}, creating=${needed}`);

  for (let i = 0; i < needed; i += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, needed - i) }, (_, j) => ({
      schoolId,
      fullName: `Teacher ${existing + i + j + 1}`,
      phone: `0300${String(existing + i + j).padStart(7, '0')}`,
      status: 'ACTIVE',
    }));
    await prisma.teacher.createMany({ data: batch });
  }
}

async function seedStaff(schoolId: string, count: number) {
  const existing = await prisma.staff.count({ where: { schoolId } });
  const needed = Math.max(0, count - existing);
  console.log(`Staff: existing=${existing}, creating=${needed}`);

  for (let i = 0; i < needed; i += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, needed - i) }, (_, j) => ({
      schoolId,
      fullName: `Staff ${existing + i + j + 1}`,
      designation: 'Clerk',
      status: 'ACTIVE',
    }));
    await prisma.staff.createMany({ data: batch });
  }
}

async function seedStudents(
  schoolId: string,
  classId: string,
  sectionId: string,
  count: number,
) {
  const existing = await prisma.student.count({ where: { schoolId } });
  const needed = Math.max(0, count - existing);
  console.log(`Students: existing=${existing}, creating=${needed}`);

  for (let i = 0; i < needed; i += BATCH) {
    const batch = Array.from({ length: Math.min(BATCH, needed - i) }, (_, j) => {
      const n = existing + i + j + 1;
      return {
        schoolId,
        admissionNo: `PERF-${String(n).padStart(6, '0')}`,
        fullName: `Student ${n}`,
        classId,
        sectionId,
        monthlyFee: 5000,
        status: 'ACTIVE',
      };
    });
    await prisma.student.createMany({ data: batch, skipDuplicates: true });
  }

  return prisma.student.findMany({
    where: { schoolId },
    select: { id: true },
    take: count,
  });
}

async function seedAttendance(
  schoolId: string,
  classId: string,
  sectionId: string,
  studentIds: string[],
  count: number,
) {
  const existing = await prisma.studentAttendance.count({ where: { schoolId } });
  const needed = Math.max(0, count - existing);
  console.log(`Attendance: existing=${existing}, creating=${needed}`);
  if (needed === 0) return;

  const statuses = [AttendanceStatus.PRESENT, AttendanceStatus.ABSENT, AttendanceStatus.LATE];
  let created = 0;
  const baseDate = new Date('2024-01-01');

  while (created < needed) {
    const batch: Prisma.StudentAttendanceCreateManyInput[] = [];
    for (let b = 0; b < BATCH && created < needed; b++, created++) {
      const studentId = studentIds[created % studentIds.length];
      const dayOffset = Math.floor(created / studentIds.length);
      const date = new Date(baseDate);
      date.setDate(date.getDate() + dayOffset);
      batch.push({
        schoolId,
        studentId,
        classId,
        sectionId,
        date,
        status: statuses[created % statuses.length],
      });
    }
    await prisma.studentAttendance.createMany({ data: batch, skipDuplicates: true });
    if (created % 5000 === 0) console.log(`  … ${created}/${needed} attendance rows`);
  }
}

async function seedInvoicesAndPayments(
  schoolId: string,
  studentIds: string[],
  invoiceCount: number,
  paymentCount: number,
) {
  const existingInv = await prisma.feeInvoice.count({ where: { schoolId } });
  const invNeeded = Math.max(0, invoiceCount - existingInv);
  console.log(`Invoices: existing=${existingInv}, creating=${invNeeded}`);

  const invoiceIds: string[] = [];

  for (let i = 0; i < invNeeded; i += 100) {
    const chunk = Math.min(100, invNeeded - i);
    const ops = Array.from({ length: chunk }, (_, j) => {
      const n = existingInv + i + j + 1;
      const studentId = studentIds[n % studentIds.length];
      const month = (n % 12) + 1;
      const year = 2024 + Math.floor(n / 12) % 2;
      return prisma.feeInvoice.create({
        data: {
          schoolId,
          studentId,
          invoiceNo: `INV-PERF-${String(n).padStart(7, '0')}`,
          month,
          year,
          amount: 5000,
          totalAmount: 5000,
          paidAmount: 0,
          status: FeeInvoiceStatus.UNPAID,
        },
        select: { id: true },
      });
    });
    const results = await prisma.$transaction(ops);
    invoiceIds.push(...results.map((r) => r.id));
    if ((i + chunk) % 2000 === 0) console.log(`  … ${i + chunk}/${invNeeded} invoices`);
  }

  const allInvoices = await prisma.feeInvoice.findMany({
    where: { schoolId },
    select: { id: true, schoolId: true },
    take: invoiceCount,
  });

  const existingPay = await prisma.feePayment.count({ where: { schoolId } });
  const payNeeded = Math.max(0, paymentCount - existingPay);
  console.log(`Payments: existing=${existingPay}, creating=${payNeeded}`);

  for (let i = 0; i < payNeeded; i += 100) {
    const chunk = Math.min(100, payNeeded - i);
    const ops = Array.from({ length: chunk }, (_, j) => {
      const n = existingPay + i + j + 1;
      const inv = allInvoices[n % allInvoices.length];
      return prisma.feePayment.create({
        data: {
          schoolId: inv.schoolId,
          invoiceId: inv.id,
          receiptNo: `RCP-PERF-${String(n).padStart(7, '0')}`,
          amount: 2500,
          method: 'CASH',
        },
      });
    });
    await prisma.$transaction(ops);
  }
}

async function main() {
  console.log('=== Clever Campus Performance Seed ===');
  const started = Date.now();
  const { school, cls, section } = await ensureSchool();

  await seedTeachers(school.id, TARGETS.teachers);
  await seedStaff(school.id, TARGETS.staff);
  const students = await seedStudents(school.id, cls.id, section.id, TARGETS.students);
  const studentIds = students.map((s) => s.id);

  await seedAttendance(school.id, cls.id, section.id, studentIds, TARGETS.attendance);
  await seedInvoicesAndPayments(school.id, studentIds, TARGETS.invoices, TARGETS.payments);

  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log('Login: perf-admin@test.com / PerfTest@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
