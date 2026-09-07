import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, School, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { homeRouteForRole } from "@/lib/permissions";
import { Button } from "@/components/form";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — School ERP" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    if (user) router.navigate({ to: homeRouteForRole(user.role) });
  }, [user, router]);

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
          <div className="flex items-center gap-3 mb-8">
            <div className="size-12 rounded-2xl bg-gradient-primary grid place-items-center shadow-soft">
              <School className="size-6 text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold text-lg leading-tight">School ERP</div>
              <div className="text-xs text-muted-foreground">Premium school management</div>
            </div>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to manage your school.</p>

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
            Trouble signing in? Contact your school administrator.
          </div>
        </div>
      </motion.div>
    </div>
  );
}
