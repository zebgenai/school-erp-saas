import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { AttendanceStatus, PrismaClient, UserRole } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { assertAttendanceItIdentity, createAttendanceItPrisma } from './attendance-it-db';

const DATE = '2026-09-17';
const SIZES = [500, 2_000, 5_000];
const enabled = process.env.ATTENDANCE_IT_BENCHMARK === '1';

let prisma: PrismaClient;

before(async () => {
  if (!enabled) return;
  prisma = createAttendanceItPrisma();
  await assertAttendanceItIdentity(prisma);
});

after(async () => {
  if (prisma) await prisma.$disconnect();
});

describe('attendance PostgreSQL bulk benchmark', () => {
  it(
    'measures 500, 2000, and 5000 student bulk writes',
    { skip: !enabled, timeout: 180_000 },
    async () => {
      const results: Array<Record<string, string | number>> = [];
      for (const size of SIZES) {
        const slug = `attendance-it-bench-${size}-${Date.now()}-${randomBytes(3).toString('hex')}`;
        const school = await prisma.school.create({
          data: { name: slug, slug, timezone: 'Asia/Karachi' },
        });
        try {
          const user = await prisma.user.create({
            data: {
              schoolId: school.id,
              name: 'Benchmark Marker',
              email: `${slug}@attendance-it.local`,
              password: 'integration-not-used',
              role: UserRole.SCHOOL_ADMIN,
            },
          });
          const classRow = await prisma.class.create({
            data: { schoolId: school.id, name: 'Bench' },
          });
          const students: Array<{ id: string }> = [];
          for (let offset = 0; offset < size; offset += 500) {
            const count = Math.min(500, size - offset);
            const created = await prisma.student.createManyAndReturn({
              data: Array.from({ length: count }, (_, index) => ({
                schoolId: school.id,
                classId: classRow.id,
                admissionNo: `${slug}-${offset + index}`,
                fullName: `Bench ${offset + index}`,
                status: 'ACTIVE',
              })),
              select: { id: true },
            });
            students.push(...created);
          }
          const recorder = { absent: 0, submitted: 0 };
          const service = new AttendanceService(prisma as never, {
            dispatch(fn: () => Promise<void>) {
              return fn();
            },
            async emitAttendanceAbsent() {
              recorder.absent += 1;
            },
            async emitAttendanceSubmitted() {
              recorder.submitted += 1;
            },
          } as never);
          const started = performance.now();
          let outcome = 'success';
          let createdCount = 0;
          let updatedCount = 0;
          let errorName = '';
          let errorMessage = '';
          try {
            const written = await service.markBulk(
              {
                classId: classRow.id,
                date: DATE,
                records: students.map((student) => ({
                  studentId: student.id,
                  status: AttendanceStatus.PRESENT,
                })),
              },
              {
                id: user.id,
                email: `${slug}@attendance-it.local`,
                name: 'Benchmark Marker',
                role: UserRole.SCHOOL_ADMIN,
                schoolId: school.id,
              },
            );
            createdCount = written.createdCount;
            updatedCount = written.updatedCount;
          } catch (error) {
            outcome = 'failure';
            errorName = error instanceof Error ? error.name : 'Error';
            const message = error instanceof Error ? error.message : 'unknown';
            errorMessage = /postgres(ql)?:\/\//i.test(message) || /password/i.test(message)
              ? 'redacted'
              : message.slice(0, 180);
          }
          const elapsedMs = Math.round(performance.now() - started);
          const rows = await prisma.studentAttendance.count({ where: { schoolId: school.id } });
          const result = {
            size,
            outcome,
            elapsedMs,
            created: createdCount,
            updated: updatedCount,
            rows,
            absentNotifications: recorder.absent,
            ...(errorName ? { errorName, errorMessage } : {}),
          };
          results.push(result);
          process.stdout.write(`${JSON.stringify(result)}\n`);
          if (outcome === 'success') {
            assert.equal(createdCount, size);
            assert.equal(rows, size);
          } else {
            assert.equal(rows, 0);
            assert.equal(recorder.absent, 0);
          }
        } finally {
          await prisma.studentAttendance.deleteMany({ where: { schoolId: school.id } });
          await prisma.student.deleteMany({ where: { schoolId: school.id } });
          await prisma.class.deleteMany({ where: { schoolId: school.id } });
          await prisma.user.deleteMany({ where: { schoolId: school.id } });
          const owned = await prisma.school.findUnique({ where: { id: school.id }, select: { slug: true } });
          if (owned?.slug.startsWith('attendance-it-bench-')) {
            await prisma.school.delete({ where: { id: school.id } });
          }
        }
      }
      assert.equal(results.length, SIZES.length);
    },
  );
});
