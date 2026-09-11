import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { otpChallengeStore } from "@/lib/otp-challenge";
import { homeRouteForRole } from "@/lib/permissions";
import { resolvePublicLogoSrc, usePublicSchoolBranding } from "@/lib/school-branding";
import { useAppHost } from "@/lib/use-app-host";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";
import { Button } from "@/components/form";

export const Route = createFileRoute("/verify-otp")({
  head: () => ({ meta: [{ title: "Verify email — School ERP" }] }),
  component: VerifyOtpPage,
});

function VerifyOtpPage() {
  const { verifyOtp, resendOtp, user } = useAuth();
  const router = useRouter();
  const host = useAppHost();
  const schoolSlug = host.ready && host.mode === "school" ? host.slug : null;
  const { branding } = usePublicSchoolBranding(schoolSlug);
  const challenge = otpChallengeStore.get();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [resendAt, setResendAt] = useState<number>(
    challenge?.resendAvailableAt ? new Date(challenge.resendAvailableAt).getTime() : Date.now(),
  );
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (user && !success) router.navigate({ to: homeRouteForRole(user.role) });
  }, [user, success, router]);

  useEffect(() => {
    if (!challenge?.challengeId) router.navigate({ to: "/login" });
  }, [challenge?.challengeId, router]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const code = digits.join("");
  const waitSec = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const expired = !!(challenge?.expiresAt && now > new Date(challenge.expiresAt).getTime());
  const emailLabel = challenge?.email || "your email";

  const masked = useMemo(() => {
    const [local, domain] = emailLabel.split("@");
    if (!local || !domain) return emailLabel;
    return `${local.slice(0, 1)}***@${domain}`;
  }, [emailLabel]);

  const setDigit = (index: number, value: string) => {
    const next = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const copy = [...prev];
      copy[index] = next;
      return copy;
    });
    if (next && index < 5) inputs.current[index + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    text.split("").forEach((ch, i) => { next[i] = ch; });
    setDigits(next);
    inputs.current[Math.min(text.length, 5)]?.focus();
  };

  const onKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const onVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (expired) {
      setError("This code has expired. Request a new one.");
      return;
    }
    if (code.length !== 6 || !challenge?.challengeId) return;
    setError(null);
    setLoading(true);
    try {
      await verifyOtp(challenge.challengeId, code);
      setSuccess(true);
      toast.success("Email verified");
      window.setTimeout(() => { window.location.href = "/"; }, 600);
    } catch (err: any) {
      setError(err?.message || "Verification failed");
      setDigits(["", "", "", "", "", ""]);
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (!challenge?.challengeId || waitSec > 0) return;
    setResending(true);
    setError(null);
    try {
      const res = await resendOtp(challenge.challengeId);
      setResendAt(res.resendAvailableAt ? new Date(res.resendAvailableAt).getTime() : Date.now() + 60_000);
      toast.success("A new code was sent");
    } catch (err: any) {
      setError(err?.message || "Could not resend code");
    } finally {
      setResending(false);
    }
  };

  const backToLogin = () => {
    otpChallengeStore.clear();
    router.navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-sidebar grid place-items-center px-4">
      <div className="absolute inset-0 bg-gradient-mesh opacity-90" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.55_0.18_258/0.25),transparent_60%)]" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="bg-card/90 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-lift">
          <AuthBrandHeader
            title={
              host.mode === "admin"
                ? "Clever Campus"
                : branding?.name || "School ERP"
            }
            subtitle="Email verification"
            logoSrc={branding ? resolvePublicLogoSrc(branding.logo, branding.slug) : null}
            variant={host.mode === "admin" ? "admin" : branding ? "school" : "default"}
          />

          {success ? (
            <div className="text-center py-6">
              <CheckCircle2 className="size-12 text-emerald-500 mx-auto mb-3" />
              <h1 className="text-2xl font-semibold">Verified</h1>
              <p className="text-sm text-muted-foreground mt-1">Taking you to your dashboard…</p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
              <p className="text-sm text-muted-foreground mt-1 flex items-start gap-2">
                <Mail className="size-4 mt-0.5 shrink-0" />
                <span>We sent a 6-digit code to <span className="font-medium text-foreground">{masked}</span>. It expires in 10 minutes.</span>
              </p>

              <form onSubmit={onVerify} className="mt-7 space-y-4">
                <div className="flex justify-between gap-2" onPaste={onPaste}>
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputs.current[i] = el; }}
                      inputMode="numeric"
                      autoComplete={i === 0 ? "one-time-code" : "off"}
                      maxLength={1}
                      value={d}
                      onChange={(e) => setDigit(i, e.target.value)}
                      onKeyDown={(e) => onKeyDown(i, e)}
                      className="w-11 h-12 text-center text-lg font-semibold rounded-xl border bg-card focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
                      aria-label={`Digit ${i + 1}`}
                    />
                  ))}
                </div>

                <AnimatePresence>
                  {(error || expired) && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
                    >
                      {error || "This code has expired. Request a new one."}
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button type="submit" loading={loading} disabled={code.length !== 6 || expired} size="lg" className="w-full mt-2">
                  {loading ? "Verifying…" : expired ? "Code expired" : "Verify"}
                </Button>
              </form>

              <div className="mt-4 text-center text-sm text-muted-foreground">
                {waitSec > 0 ? (
                  <span>Resend code in {waitSec}s</span>
                ) : (
                  <button type="button" onClick={onResend} disabled={resending} className="text-primary hover:underline disabled:opacity-60">
                    {resending ? "Sending…" : "Resend OTP"}
                  </button>
                )}
              </div>

              <div className="mt-6 text-center">
                <button type="button" onClick={backToLogin} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="size-3.5" /> Change email / back to login
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
