import { UserRole } from '@prisma/client';

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  schoolId?: string | null;
};
