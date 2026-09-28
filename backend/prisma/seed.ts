import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const superAdminPassword = await bcrypt.hash('SuperAdmin@123', 10);
  const schoolAdminPassword = await bcrypt.hash('Admin@123', 10);

  await prisma.user.upsert({
    where: { email: 'atifcyber7@gmail.com' },
    update: {
      name: 'Atif Zeb',
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      schoolId: null,
    },
    create: {
      name: 'Atif Zeb',
      email: 'atifcyber7@gmail.com',
      password: superAdminPassword,
      status: UserStatus.ACTIVE,
      role: UserRole.SUPER_ADMIN,
    },
  });

  const school = await prisma.school.upsert({
    where: { slug: 'iqra-smart-school' },
    update: {},
    create: {
      name: 'IQRA Smart School',
      slug: 'iqra-smart-school',
      domain: 'iqra.localhost',
      address: 'Peshawar, Pakistan',
      phone: '03000000000',
      email: 'info@iqrasmartschool.com',
      themeColor: '#2563eb',
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@iqra.com' },
    update: {},
    create: {
      schoolId: school.id,
      name: 'IQRA School Admin',
      email: 'admin@iqra.com',
      password: schoolAdminPassword,
      role: UserRole.SCHOOL_ADMIN,
    },
  });

  const classOne = await prisma.class.upsert({
    where: { schoolId_name: { schoolId: school.id, name: 'Class 1' } },
    update: {},
    create: { schoolId: school.id, name: 'Class 1' },
  });

  await prisma.section.upsert({
    where: { schoolId_classId_name: { schoolId: school.id, classId: classOne.id, name: 'A' } },
    update: {},
    create: { schoolId: school.id, classId: classOne.id, name: 'A' },
  });

  console.log('Seeding Feature Control catalog…');

  // Feature Control catalog (idempotent; also ensured on API boot via FeaturesService).
  for (const entry of [
    { key: 'authentication', name: 'Authentication', description: 'Login, sessions, and account access', isCore: true },
    { key: 'students', name: 'Students', description: 'Student records and management', isCore: true },
    { key: 'parents', name: 'Parents', description: 'Parent records and portal links', isCore: true },
    { key: 'teachers', name: 'Teachers', description: 'Teacher records and assignments', isCore: true },
    { key: 'staff', name: 'Staff', description: 'Non-teaching staff management', isCore: true },
    { key: 'classes', name: 'Classes', description: 'Classes and sections', isCore: true },
    { key: 'subjects', name: 'Subjects', description: 'Subject catalog', isCore: true },
    { key: 'attendance', name: 'Attendance', description: 'Student/teacher attendance and QR scanning (always on)', isCore: true },
    { key: 'settings', name: 'Settings', description: 'School settings', isCore: true },
    { key: 'id-cards', name: 'ID Cards', description: 'Student and teacher ID cards', isCore: true },
    { key: 'exams', name: 'Exams', description: 'Exam setup, marks, and results', isCore: false },
    {
      key: 'results',
      name: 'Results',
      description:
        'Marks and results — linked to Exams (follows Exams ON/OFF; no independent runtime state)',
      isCore: false,
    },
    { key: 'fees', name: 'Fees', description: 'Fee structures, invoices, and payments', isCore: false },
    { key: 'payroll', name: 'Payroll', description: 'Staff payroll', isCore: false },
    { key: 'expenses', name: 'Expenses', description: 'School expenses', isCore: false },
    { key: 'library', name: 'Library', description: 'Library books and issues', isCore: false },
    { key: 'transport', name: 'Transport', description: 'Vehicles and routes', isCore: false },
    { key: 'communication', name: 'Communication', description: 'Notices and announcements', isCore: false },
    { key: 'notifications', name: 'Notifications', description: 'In-app and campaign notifications', isCore: false },
    { key: 'homework', name: 'Homework', description: 'Homework assignments', isCore: false },
    { key: 'online-classes', name: 'Online Classes', description: 'Online class sessions', isCore: false },
    { key: 'academic-calendar', name: 'Academic Calendar', description: 'School calendar events', isCore: false },
    { key: 'timetable', name: 'Timetable', description: 'Class timetables', isCore: false },
    { key: 'reports', name: 'Reports', description: 'Analytics and reports', isCore: false },
  ]) {
    await prisma.feature.upsert({
      where: { key: entry.key },
      create: {
        key: entry.key,
        name: entry.name,
        description: entry.description,
        isGloballyEnabled: true,
        isCore: entry.isCore,
      },
      update: {
        name: entry.name,
        description: entry.description,
        isCore: entry.isCore,
      },
    });
  }

  console.log('Seed completed successfully');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
