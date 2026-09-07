// Central API client for School ERP
import { ApiError, formatApiError } from "./errors";

export { ApiError } from "./errors";

/**
 * API root, resolved at call time so SSR and the browser do not share a stale value.
 * In local dev the UI is on :8080 and Nest is on :3000. Browser fetches use
 * same-origin `/api` (Vite proxies to Nest) so student PDF/print is not a
 * cross-origin request. SSR still uses VITE_API_URL.
 */
export function getApiBaseUrl(): string {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return `${window.location.origin}/api`;
    }
  }
  return configured || "http://localhost:3000/api";
}

/** @deprecated Prefer getApiBaseUrl() — this snapshot can be wrong after SSR. */
export const API_BASE_URL = getApiBaseUrl();

const TOKEN_KEY = "erp_access_token";
const REFRESH_KEY = "erp_refresh_token";

export const tokenStore = {
  get: () => (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  getRefresh: () => (typeof window !== "undefined" ? localStorage.getItem(REFRESH_KEY) : null),
  setRefresh: (t: string) => localStorage.setItem(REFRESH_KEY, t),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** Resolve a relative upload/file path to an authenticated download URL */
export function resolveFileUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  const filename = path.replace(/^\/uploads\//, "").replace(/^uploads\//, "");
  const token = tokenStore.get();
  let url = `${getApiBaseUrl()}/uploads/files/${encodeURIComponent(filename)}`;
  if (token) url += `?access_token=${encodeURIComponent(token)}`;
  return url;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE" | "PUT";

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

const STRIP_FIELDS = new Set([
  "id", "createdAt", "updatedAt", "createdBy", "updatedBy",
  "student", "class", "section", "school", "payments", "invoice",
  "_id", "__v",
]);

export function sanitizePayload<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (STRIP_FIELDS.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.accessToken) tokenStore.set(data.accessToken);
        if (data.refreshToken) tokenStore.setRefresh(data.refreshToken);
        return data.accessToken || null;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function request<T = any>(
  method: Method,
  path: string,
  body?: any,
  opts?: { params?: Record<string, any>; retry?: boolean }
): Promise<T> {
  const token = tokenStore.get();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let url = `${getApiBaseUrl()}${path}`;
  if (opts?.params) {
    const qs = new URLSearchParams();
    Object.entries(opts.params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    });
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const cleanedBody = method !== "GET" && body && typeof body === "object" && !Array.isArray(body)
    ? sanitizePayload(body)
    : body;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: cleanedBody !== undefined ? JSON.stringify(cleanedBody) : undefined,
    });
  } catch (e: any) {
    throw new ApiError(e?.message || "Network error", 0);
  }

  if (res.status === 401 && !opts?.retry && path !== "/auth/refresh" && path !== "/auth/login" && path !== "/auth/verify-otp" && path !== "/auth/resend-otp" && path !== "/auth/verify-login-otp" && path !== "/auth/resend-login-otp") {
    const newToken = await tryRefreshToken();
    if (newToken) {
      return request<T>(method, path, body, { ...opts, retry: true });
    }
    tokenStore.clear();
    onUnauthorized?.();
    throw new ApiError("Unauthorized", 401);
  }

  if (res.status === 401) {
    tokenStore.clear();
    onUnauthorized?.();
    throw new ApiError("Unauthorized", 401);
  }

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) {
    let msg: any = (data && (data.message || data.error)) || `Request failed (${res.status})`;
    if (Array.isArray(msg)) msg = msg[0] ?? msg.join(", ");
    else if (typeof msg !== "string") msg = JSON.stringify(msg);
    const err = new ApiError(String(msg), res.status, data);
    err.message = formatApiError(err);
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string, params?: Record<string, any>) => request<T>("GET", path, undefined, { params }),
  post: <T = any>(path: string, body?: any) => request<T>("POST", path, body),
  patch: <T = any>(path: string, body?: any) => request<T>("PATCH", path, body),
  put: <T = any>(path: string, body?: any) => request<T>("PUT", path, body),
  delete: <T = any>(path: string) => request<T>("DELETE", path),
};

export async function authorizedFetch(
  url: string,
  init: RequestInit = {},
  retry = false,
): Promise<Response> {
  const token = tokenStore.get();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const fetchFn = typeof window !== "undefined" ? window.fetch.bind(window) : fetch;
  const res = await fetchFn(url, { ...init, headers, mode: "cors" });

  if (res.status === 401 && !retry && !url.includes("/auth/refresh") && !url.includes("/auth/login") && !url.includes("/auth/verify-otp") && !url.includes("/auth/resend-otp") && !url.includes("/auth/verify-login-otp") && !url.includes("/auth/resend-login-otp")) {
    const newToken = await tryRefreshToken();
    if (newToken) return authorizedFetch(url, init, true);
    tokenStore.clear();
    onUnauthorized?.();
  }
  return res;
}

export async function logoutApi() {
  const refreshToken = tokenStore.getRefresh();
  if (refreshToken) {
    try {
      await api.post("/auth/logout", { refreshToken });
    } catch {
      /* ignore */
    }
  }
  tokenStore.clear();
}
