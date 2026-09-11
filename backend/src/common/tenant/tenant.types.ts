import type { SchoolStatus } from '@prisma/client';

export type TenantSchool = {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  status: SchoolStatus;
};

export type HostTenantClassification =
  | { kind: 'none' }
  | { kind: 'platform' }
  | { kind: 'school'; slug: string };

declare global {
  namespace Express {
    interface Request {
      tenantSchool?: TenantSchool | null;
      tenantSchoolId?: string | null;
    }
  }
}

export {};
