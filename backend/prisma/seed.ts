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
