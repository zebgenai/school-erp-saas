export const TENANT_ROOT_DOMAIN = "clevercampus.cloud";

export const RESERVED_SUBDOMAINS = ["admin", "www", "api", "app", "mail"] as const;

const RESERVED = new Set<string>(RESERVED_SUBDOMAINS);

export type AppHost =
  | { mode: "local"; hostname: string; slug: null }
  | { mode: "apex"; hostname: string; slug: null }
  | { mode: "admin"; hostname: string; slug: null }
  | { mode: "school"; hostname: string; slug: string };

function normalizeHostname(value?: string | null): string {
  if (!value) return "";
  let host = value.trim().toLowerCase();
  if (host.startsWith("[")) {
    const close = host.indexOf("]");
    if (close !== -1) return host.slice(1, close);
  }
  const colon = host.lastIndexOf(":");
  if (colon !== -1 && /^\d+$/.test(host.slice(colon + 1))) {
    host = host.slice(0, colon);
  }
  return host.replace(/\.$/, "");
}

function isLocalHostname(hostname: string): boolean {
  return (
    !hostname ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  );
}

/**
 * Application mode from the browser hostname.
 * Individual school names are never hardcoded — only the slug label is read.
 */
export function getAppHost(hostname?: string | null): AppHost {
  const host = normalizeHostname(
    hostname ?? (typeof window !== "undefined" ? window.location.hostname : ""),
  );

  if (isLocalHostname(host)) {
    return { mode: "local", hostname: host || "localhost", slug: null };
  }

  if (host === TENANT_ROOT_DOMAIN || host === `www.${TENANT_ROOT_DOMAIN}`) {
    return { mode: "apex", hostname: host, slug: null };
  }

  const suffix = `.${TENANT_ROOT_DOMAIN}`;
  if (!host.endsWith(suffix)) {
    return { mode: "local", hostname: host, slug: null };
  }

  const label = host.slice(0, -suffix.length);
  if (!label || label.includes(".")) {
    return { mode: "apex", hostname: host, slug: null };
  }

  if (label === "admin") {
    return { mode: "admin", hostname: host, slug: null };
  }

  if (RESERVED.has(label)) {
    return { mode: "apex", hostname: host, slug: null };
  }

  return { mode: "school", hostname: host, slug: label };
}

export function schoolLoginOrigin(slug: string): string {
  return `https://${slug}.${TENANT_ROOT_DOMAIN}`;
}

export function adminLoginOrigin(): string {
  return `https://admin.${TENANT_ROOT_DOMAIN}`;
}

export const WRONG_HOST_STORAGE_KEY = "erp_wrong_host";

export function markWrongHost() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(WRONG_HOST_STORAGE_KEY, "1");
}

export function consumeWrongHostFlag(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const flagged = sessionStorage.getItem(WRONG_HOST_STORAGE_KEY) === "1";
  if (flagged) sessionStorage.removeItem(WRONG_HOST_STORAGE_KEY);
  return flagged;
}
