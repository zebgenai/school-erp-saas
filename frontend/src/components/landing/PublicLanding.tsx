import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2, Shield, Sparkles } from "lucide-react";
import { adminLoginOrigin } from "@/lib/host";

export function PublicLanding() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className="absolute inset-0 bg-gradient-mesh opacity-90" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.55_0.18_258/0.28),transparent_60%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-primary grid place-items-center shadow-soft">
              <Sparkles className="size-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold leading-tight">Clever Campus</div>
              <div className="text-[11px] text-sidebar-foreground/60">School ERP</div>
            </div>
          </div>
          <Link
            to="/login"
            className="text-sm font-medium text-sidebar-foreground/80 hover:text-sidebar-foreground transition"
          >
            Sign in
          </Link>
        </header>

        <main className="flex-1 grid place-items-center py-16">
          <div className="max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-glow">Clever Campus</p>
            <h1 className="mt-3 font-display text-4xl sm:text-5xl font-semibold tracking-tight">
              School management, one campus at a time.
            </h1>
            <p className="mt-4 text-sm sm:text-base text-sidebar-foreground/70 leading-relaxed">
              Each school signs in on its own subdomain. Platform operators use the admin console.
              This public site is the front door — not a school workspace.
            </p>

            <div className="mt-10 grid sm:grid-cols-2 gap-4 text-left">
              <div className="rounded-2xl border border-white/10 bg-card/10 backdrop-blur-md p-5">
                <Building2 className="size-5 text-primary-glow" />
                <h2 className="mt-3 font-semibold">Schools</h2>
                <p className="mt-1 text-sm text-sidebar-foreground/65">
                  Sign in at your school address, for example{" "}
                  <span className="font-mono text-xs">your-school.clevercampus.cloud</span>.
                </p>
              </div>
              <a
                href={`${adminLoginOrigin()}/login`}
                className="rounded-2xl border border-white/10 bg-card/10 backdrop-blur-md p-5 hover:bg-card/16 transition"
              >
                <Shield className="size-5 text-primary-glow" />
                <h2 className="mt-3 font-semibold flex items-center gap-2">
                  Platform admin
                  <ArrowRight className="size-4" />
                </h2>
                <p className="mt-1 text-sm text-sidebar-foreground/65">
                  Super Admin and platform managers sign in at admin.clevercampus.cloud.
                </p>
              </a>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
