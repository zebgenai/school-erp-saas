import { RESERVED_TENANT_SUBDOMAIN_SET, TENANT_ROOT_DOMAIN } from './tenant.constants';
import type { HostTenantClassification } from './tenant.types';

export function normalizeHostHeader(host?: string | string[]): string {
  const raw = Array.isArray(host) ? host[0] : host;
  if (!raw) return '';

  let value = raw.trim().toLowerCase();
  if (value.startsWith('[')) {
    const close = value.indexOf(']');
    if (close !== -1) return value.slice(1, close);
  }

  const colon = value.lastIndexOf(':');
  if (colon !== -1) {
    const maybePort = value.slice(colon + 1);
    if (/^\d+$/.test(maybePort)) {
      value = value.slice(0, colon);
    }
  }

  return value.replace(/\.$/, '');
}

export function isLocalDevHostname(hostname: string): boolean {
  if (!hostname) return true;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  );
}

export function classifyHostname(hostHeader?: string | string[]): HostTenantClassification {
  const hostname = normalizeHostHeader(hostHeader);
  if (!hostname || isLocalDevHostname(hostname)) {
    return { kind: 'none' };
  }

  if (hostname === TENANT_ROOT_DOMAIN) {
    return { kind: 'platform' };
  }

  const suffix = `.${TENANT_ROOT_DOMAIN}`;
  if (!hostname.endsWith(suffix)) {
    return { kind: 'none' };
  }

  const label = hostname.slice(0, -suffix.length);
  if (!label || label.includes('.')) {
    return { kind: 'none' };
  }

  if (RESERVED_TENANT_SUBDOMAIN_SET.has(label)) {
    return { kind: 'platform' };
  }

  return { kind: 'school', slug: label };
}
