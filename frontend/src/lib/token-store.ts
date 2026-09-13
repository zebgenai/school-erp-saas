export const ACCESS_TOKEN_KEY = "erp_access_token";
export const REFRESH_TOKEN_KEY = "erp_refresh_token";

export type WebStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function browserStorage(kind: "session" | "local"): WebStorage | null {
  if (typeof window === "undefined") return null;
  return kind === "session" ? window.sessionStorage : window.localStorage;
}

/** Session-scoped token store with a one-time legacy localStorage migration. */
export function createTokenStore(session: WebStorage | null, local: WebStorage | null) {
  let migrated = false;

  const migrateFromLocalStorage = () => {
    if (migrated || !session || !local) return;
    migrated = true;

    const sessionAccess = session.getItem(ACCESS_TOKEN_KEY);
    const sessionRefresh = session.getItem(REFRESH_TOKEN_KEY);
    const localAccess = local.getItem(ACCESS_TOKEN_KEY);
    const localRefresh = local.getItem(REFRESH_TOKEN_KEY);

    if (!sessionAccess && localAccess) {
      session.setItem(ACCESS_TOKEN_KEY, localAccess);
    }
    if (!sessionRefresh && localRefresh) {
      session.setItem(REFRESH_TOKEN_KEY, localRefresh);
    }

    local.removeItem(ACCESS_TOKEN_KEY);
    local.removeItem(REFRESH_TOKEN_KEY);
  };

  return {
    get() {
      migrateFromLocalStorage();
      return session?.getItem(ACCESS_TOKEN_KEY) ?? null;
    },
    set(token: string) {
      migrateFromLocalStorage();
      session?.setItem(ACCESS_TOKEN_KEY, token);
      local?.removeItem(ACCESS_TOKEN_KEY);
    },
    getRefresh() {
      migrateFromLocalStorage();
      return session?.getItem(REFRESH_TOKEN_KEY) ?? null;
    },
    setRefresh(token: string) {
      migrateFromLocalStorage();
      session?.setItem(REFRESH_TOKEN_KEY, token);
      local?.removeItem(REFRESH_TOKEN_KEY);
    },
    clear() {
      session?.removeItem(ACCESS_TOKEN_KEY);
      session?.removeItem(REFRESH_TOKEN_KEY);
      local?.removeItem(ACCESS_TOKEN_KEY);
      local?.removeItem(REFRESH_TOKEN_KEY);
    },
  };
}

export const tokenStore = createTokenStore(browserStorage("session"), browserStorage("local"));
