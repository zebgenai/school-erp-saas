/** Apex domain used for school subdomains. Hosts outside this tree are not tenants. */
export const TENANT_ROOT_DOMAIN = 'clevercampus.cloud';

/**
 * Labels under TENANT_ROOT_DOMAIN that are platform (no school), never a school slug.
 */
export const RESERVED_TENANT_SUBDOMAINS = ['admin', 'www', 'api', 'app', 'mail'] as const;

export const RESERVED_TENANT_SUBDOMAIN_SET = new Set<string>(RESERVED_TENANT_SUBDOMAINS);
