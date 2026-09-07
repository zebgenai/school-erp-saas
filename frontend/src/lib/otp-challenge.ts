const KEY = "erp_otp_challenge";

export type OtpChallengeState = {
  challengeId: string;
  email: string;
  expiresAt?: string;
  resendAvailableAt?: string;
};

export const otpChallengeStore = {
  get(): OtpChallengeState | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as OtpChallengeState;
      if (!parsed?.challengeId) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  set(state: OtpChallengeState) {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  },
  clear() {
    sessionStorage.removeItem(KEY);
  },
};
