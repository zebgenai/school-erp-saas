export { TENANT_ROOT_DOMAIN, RESERVED_TENANT_SUBDOMAINS } from './tenant.constants';
export {
  allocateUniqueSchoolSlug,
  schoolTenantDomain,
  slugifySchoolName,
} from './school-slug';
export { classifyHostname, normalizeHostHeader } from './tenant-host';
export { TenantResolverService } from './tenant.service';
export { TenantModule } from './tenant.module';
export { assertTenantIsolation } from './tenant-isolation';
export { isTenantLoginRejected } from './tenant-login';
export type { TenantSchool } from './tenant.types';
