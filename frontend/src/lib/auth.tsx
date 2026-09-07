import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, tokenStore, setUnauthorizedHandler, logoutApi } from "./api";
import { otpChallengeStore } from "./otp-challenge";

export type AuthUser = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  schoolId?: string;
  school?: { id?: string; name?: string; logoUrl?: string | null } | null;
  schoolName?: string;
  forcePasswordChange?: boolean;
  permissions?: Record<string, boolean>;
  [k: string]: unknown;
};

type TokenResponse = {
  requiresOtp?: boolean;
  challengeId?: string;
  email?: string;
  expiresAt?: string;
  resendAvailableAt?: string;
  accessToken?: string;
  token?: string;
  refreshToken?: string;
  data?: { accessToken?: string; refreshToken?: string };
};

type AuthCtx = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ requiresOtp: boolean; otpSkipped?: boolean }>;
  verifyOtp: (challengeId: string, code: string) => Promise<void>;
  resendOtp: (challengeId: string) => Promise<{ resendAvailableAt?: string; expiresAt?: string }>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

function applyTokens(res: TokenResponse) {
  const token = res?.accessToken || res?.token || res?.data?.accessToken;
  const refresh = res?.refreshToken || res?.data?.refreshToken;
  if (!token) throw new Error("No access token returned");
  tokenStore.set(token);
  if (refresh) tokenStore.setRefresh(refresh);
}

function pendingOtpPath() {
  return otpChallengeStore.get() ? "/verify-otp" : "/login";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const data = await api.get<{ user?: AuthUser; data?: AuthUser } & AuthUser>("/auth/me");
      setUser(data?.user || data?.data || data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      if (typeof window !== "undefined" && window.location.pathname !== "/login" && window.location.pathname !== "/verify-otp") {
        window.location.href = pendingOtpPath();
      }
    });
    (async () => {
      if (tokenStore.get()) {
        await fetchMe();
      }
      setLoading(false);
    })();
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<TokenResponse>("/auth/login", { email, password });
    if (res?.requiresOtp && res.challengeId) {
      otpChallengeStore.set({
        challengeId: res.challengeId,
        email,
        expiresAt: res.expiresAt,
        resendAvailableAt: res.resendAvailableAt,
      });
      return { requiresOtp: true };
    }
    applyTokens(res);
    otpChallengeStore.clear();
    await fetchMe();
    return { requiresOtp: false };
  }, [fetchMe]);

  const verifyOtp = useCallback(async (challengeId: string, code: string) => {
    const res = await api.post<TokenResponse>("/auth/verify-otp", { challengeId, code });
    applyTokens(res);
    otpChallengeStore.clear();
    await fetchMe();
  }, [fetchMe]);

  const resendOtp = useCallback(async (challengeId: string) => {
    const res = await api.post<TokenResponse>("/auth/resend-otp", { challengeId });
    const current = otpChallengeStore.get();
    if (current) {
      otpChallengeStore.set({
        ...current,
        expiresAt: res.expiresAt || current.expiresAt,
        resendAvailableAt: res.resendAvailableAt || current.resendAvailableAt,
      });
    }
    return { resendAvailableAt: res.resendAvailableAt, expiresAt: res.expiresAt };
  }, []);

  const logout = useCallback(() => {
    otpChallengeStore.clear();
    logoutApi().finally(() => {
      setUser(null);
      if (typeof window !== "undefined") window.location.href = "/login";
    });
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, verifyOtp, resendOtp, logout, refresh: fetchMe }),
    [user, loading, login, verifyOtp, resendOtp, logout, fetchMe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
