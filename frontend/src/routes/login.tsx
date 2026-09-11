import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { consumeWrongHostFlag } from "@/lib/host";
import { homeRouteForRole } from "@/lib/permissions";
import { resolvePublicLogoSrc, usePublicSchoolBranding } from "@/lib/school-branding";
import { useAppHost } from "@/lib/use-app-host";
import { AuthBrandHeader } from "@/components/auth/AuthBrandHeader";
import { UnknownSchool } from "@/components/auth/UnknownSchool";
import { Button } from "@/components/form";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Clever Campus" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const host = useAppHost();
  const schoolSlug = host.ready && host.mode === "school" ? host.slug : null;
  const { branding, loading: brandLoading, missing } = usePublicSchoolBranding(schoolSlug);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [wrongHost, setWrongHost] = useState(false);

  useEffect(() => {
    if (consumeWrongHostFlag()) setWrongHost(true);
  }, []);

  useEffect(() => {
    if (host.mode === "school" && (brandLoading || missing || !branding)) return;
    if (user) router.navigate({ to: homeRouteForRole(user.role) });
  }, [user, router, host.mode, brandLoading, missing, branding]);

  const copy = useMemo(() => {
    if (host.mode === "admin") {
      return {
        title: "Clever Campus",
        subtitle: "Platform administration",
        heading: "Admin sign in",
        description: "Sign in with your platform account.",
        variant: "admin" as const,
        logoSrc: null as string | null,
      };
    }
    if (host.mode === "school" && branding) {
      return {
        title: branding.name,
        subtitle: "School Login",
        heading: "Welcome back",
        description: `Sign in to ${branding.name}.`,
        variant: "school" as const,
        logoSrc: resolvePublicLogoSrc(branding.logo, branding.slug),
      };
    }
    if (host.mode === "apex") {
      return {
        title: "Clever Campus",
        subtitle: "School management platform",
        heading: "Sign in",
        description: "Schools should sign in on their own subdomain.",
        variant: "default" as const,
        logoSrc: null as string | null,
      };
    }
    return {
      title: "School ERP",
      subtitle: "Premium school management",
      heading: "Welcome back",
      description: "Sign in to manage your school.",
      variant: "default" as const,
      logoSrc: null as string | null,
    };
  }, [host.mode, branding]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.requiresOtp) {
        toast.success("Check your email for a verification code");
        router.navigate({ to: "/verify-otp" });
        return;
      }
      toast.success("Welcome back!");
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotBusy(true);
    try {
      await api.post("/auth/forgot-password", { email: forgotEmail.trim() });
      setForgotSent(true);
      toast.success("If that email exists, reset instructions were sent.");
    } catch (err: any) {
      toast.error(err?.message || "Request failed");
    } finally {
      setForgotBusy(false);
    }
  };

  if (host.mode === "pending") {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (host.mode === "school") {
    if (brandLoading || (!branding && !missing)) {
      return (
        <div className="min-h-screen grid place-items-center">
          <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      );
    }
    if (missing || !branding) {
      return <UnknownSchool />;
    }
  }

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
            title={copy.title}
            subtitle={copy.subtitle}
            logoSrc={copy.logoSrc}
            variant={copy.variant}
          />

          <h1 className="text-2xl font-semibold tracking-tight">{copy.heading}</h1>
              <p className="text-sm text-muted-foreground mt-1">{copy.description}</p>

              {wrongHost && (
                <div className="mt-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  That account belongs to a different school. Sign in here only if you belong to this campus.
                </div>
              )}

              <form onSubmit={onSubmit} className="mt-7 space-y-4">
                <div>
                  <label className="text-xs font-medium text-foreground/80">Email</label>
                  <div className="relative mt-1.5">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-11 pl-10 pr-3 rounded-xl border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
                      placeholder="you@school.com" autoComplete="email"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground/80">Password</label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input
                      type={show ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-11 pl-10 pr-10 rounded-xl border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring"
                      placeholder="••••••••" autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setShow((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 size-8 grid place-items-center rounded-md hover:bg-muted">
                      {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, height: 0 }}
                      animate={{ opacity: 1, y: 0, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2"
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button type="submit" loading={loading} size="lg" className="w-full mt-2">
                  {!loading && <>Sign in <ArrowRight className="size-4" /></>}
                  {loading && "Signing in…"}
                </Button>
              </form>

              <div className="mt-4 text-center">
                <button type="button" onClick={() => { setForgotOpen(true); setForgotEmail(email); setForgotSent(false); }}
                  className="text-xs text-primary hover:underline">
                  Forgot password?
                </button>
              </div>

              {forgotOpen && (
                <div className="mt-4 p-4 rounded-xl border bg-muted/30 space-y-3">
                  {forgotSent ? (
                    <p className="text-sm text-muted-foreground">Check your email for password reset instructions.</p>
                  ) : (
                    <form onSubmit={onForgot} className="space-y-3">
                      <p className="text-sm font-medium">Reset password</p>
                      <input
                        type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl border bg-card text-sm"
                        placeholder="you@school.com"
                      />
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setForgotOpen(false)}>Cancel</Button>
                        <Button type="submit" size="sm" loading={forgotBusy}>Send reset link</Button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              <div className="mt-6 text-center text-xs text-muted-foreground">
                {host.mode === "admin"
                  ? "Platform operators only. School staff should use their school subdomain."
                  : "Trouble signing in? Contact your school administrator."}
              </div>
        </div>
      </motion.div>
    </div>
  );
}
