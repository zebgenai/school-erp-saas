import { RESERVED_TENANT_SUBDOMAIN_SET, TENANT_ROOT_DOMAIN } from './tenant.constants';

export const SCHOOL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MIN_SCHOOL_SLUG_LENGTH = 2;
export const MAX_SCHOOL_SLUG_LENGTH = 80;

export function isValidSchoolSlug(slug: string): boolean {
  return (
    SCHOOL_SLUG_PATTERN.test(slug) &&
    slug.length >= MIN_SCHOOL_SLUG_LENGTH &&
    slug.length <= MAX_SCHOOL_SLUG_LENGTH
  );
}

export function slugifySchoolName(name: string): string {
  let slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length > MAX_SCHOOL_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SCHOOL_SLUG_LENGTH).replace(/-+$/g, '');
  }

  return isValidSchoolSlug(slug) ? slug : 'school';
}

export function isReservedTenantSlug(slug: string): boolean {
  return RESERVED_TENANT_SUBDOMAIN_SET.has(slug);
}

export function schoolTenantDomain(slug: string): string {
  return `${slug}.${TENANT_ROOT_DOMAIN}`;
}

function clipSlug(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen).replace(/-+$/g, '');
}

function candidateSlug(base: string, n: number): string {
  if (n === 0) return clipSlug(base, MAX_SCHOOL_SLUG_LENGTH);
  const suffix = `-${n + 1}`;
  return `${clipSlug(base, MAX_SCHOOL_SLUG_LENGTH - suffix.length)}${suffix}`;
}

/**
 * First unused slug: base, then base-2, base-3, … Reserved labels are skipped.
 * Existing rows are never rewritten — only a new unused candidate is returned.
 */
export async function allocateUniqueSchoolSlug(
  name: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugifySchoolName(name);
  let n = 0;
  while (n < 1000) {
    const candidate = candidateSlug(base, n);
    n += 1;
    if (!isValidSchoolSlug(candidate)) continue;
    if (isReservedTenantSlug(candidate)) continue;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error('Could not allocate a unique school slug');
}
