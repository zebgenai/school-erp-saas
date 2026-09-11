import { RESERVED_TENANT_SUBDOMAIN_SET, TENANT_ROOT_DOMAIN } from './tenant.constants';

export function slugifySchoolName(name: string): string {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'school';
}

export function isReservedTenantSlug(slug: string): boolean {
  return RESERVED_TENANT_SUBDOMAIN_SET.has(slug);
}

export function schoolTenantDomain(slug: string): string {
  return `${slug}.${TENANT_ROOT_DOMAIN}`;
}

/**
 * First unused slug: base, then base-2, base-3, … Reserved labels are skipped.
 */
export async function allocateUniqueSchoolSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugifySchoolName(name);
  let n = 0;
  while (n < 1000) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    n += 1;
    if (isReservedTenantSlug(candidate)) continue;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error('Could not allocate a unique school slug');
}
