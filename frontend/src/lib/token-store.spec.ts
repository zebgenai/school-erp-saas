import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  createTokenStore,
  type WebStorage,
} from "./token-store.ts";

function memoryStorage(initial: Record<string, string> = {}): WebStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem(key: string) {
      return data[key] ?? null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    removeItem(key: string) {
      delete data[key];
    },
  };
}

describe("tokenStore session persistence", () => {
  it("stores access and refresh tokens in sessionStorage only", () => {
    const session = memoryStorage();
    const local = memoryStorage();
    const store = createTokenStore(session, local);

    store.set("access-1");
    store.setRefresh("refresh-1");

    assert.equal(store.get(), "access-1");
    assert.equal(store.getRefresh(), "refresh-1");
    assert.equal(session.getItem(ACCESS_TOKEN_KEY), "access-1");
    assert.equal(session.getItem(REFRESH_TOKEN_KEY), "refresh-1");
    assert.equal(local.getItem(ACCESS_TOKEN_KEY), null);
    assert.equal(local.getItem(REFRESH_TOKEN_KEY), null);
  });

  it("migrates legacy localStorage tokens once and then removes them", () => {
    const session = memoryStorage();
    const local = memoryStorage({
      [ACCESS_TOKEN_KEY]: "legacy-access",
      [REFRESH_TOKEN_KEY]: "legacy-refresh",
    });
    const store = createTokenStore(session, local);

    assert.equal(store.get(), "legacy-access");
    assert.equal(store.getRefresh(), "legacy-refresh");
    assert.equal(session.getItem(ACCESS_TOKEN_KEY), "legacy-access");
    assert.equal(session.getItem(REFRESH_TOKEN_KEY), "legacy-refresh");
    assert.equal(local.getItem(ACCESS_TOKEN_KEY), null);
    assert.equal(local.getItem(REFRESH_TOKEN_KEY), null);

    local.setItem(ACCESS_TOKEN_KEY, "should-not-win");
    assert.equal(store.get(), "legacy-access");
  });

  it("does not overwrite existing session tokens during migration", () => {
    const session = memoryStorage({
      [ACCESS_TOKEN_KEY]: "session-access",
      [REFRESH_TOKEN_KEY]: "session-refresh",
    });
    const local = memoryStorage({
      [ACCESS_TOKEN_KEY]: "legacy-access",
      [REFRESH_TOKEN_KEY]: "legacy-refresh",
    });
    const store = createTokenStore(session, local);

    assert.equal(store.get(), "session-access");
    assert.equal(store.getRefresh(), "session-refresh");
    assert.equal(local.getItem(ACCESS_TOKEN_KEY), null);
    assert.equal(local.getItem(REFRESH_TOKEN_KEY), null);
  });

  it("clear() removes tokens from session and leftover local storage", () => {
    const session = memoryStorage();
    const local = memoryStorage();
    const store = createTokenStore(session, local);
    store.set("access-1");
    store.setRefresh("refresh-1");
    store.clear();

    assert.equal(store.get(), null);
    assert.equal(store.getRefresh(), null);
    assert.equal(session.getItem(ACCESS_TOKEN_KEY), null);
    assert.equal(session.getItem(REFRESH_TOKEN_KEY), null);
  });
});
