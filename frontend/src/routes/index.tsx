import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { homeRouteForRole } from "@/lib/permissions";
import { otpChallengeStore } from "@/lib/otp-challenge";
import { usePublicSchoolBranding } from "@/lib/school-branding";
import { useAppHost } from "@/lib/use-app-host";
import { UnknownSchool } from "@/components/auth/UnknownSchool";
import { PublicLanding } from "@/components/landing/PublicLanding";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const host = useAppHost();
  const schoolSlug = host.ready && host.mode === "school" ? host.slug : null;
  const { branding, loading: brandLoading, missing } = usePublicSchoolBranding(schoolSlug);

  useEffect(() => {
    if (host.mode === "pending" || loading) return;
    if (host.mode === "apex") return;
    if (host.mode === "school") {
      if (brandLoading || missing || !branding) return;
    }
    if (!user) {
      router.navigate({ to: otpChallengeStore.get() ? "/verify-otp" : "/login" });
      return;
    }
    router.navigate({ to: homeRouteForRole(user.role) });
  }, [user, loading, router, host.ready, host.mode, brandLoading, missing, branding]);

  if (host.mode === "pending") {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (host.mode === "apex") {
    return <PublicLanding />;
  }

  if (host.mode === "school") {
    if (missing || (!brandLoading && !branding)) {
      return <UnknownSchool />;
    }
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}
