import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { homeRouteForRole } from "@/lib/permissions";
import { otpChallengeStore } from "@/lib/otp-challenge";
import { useAppHost } from "@/lib/use-app-host";
import { PublicLanding } from "@/components/landing/PublicLanding";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const host = useAppHost();

  useEffect(() => {
    if (!host.ready || loading) return;
    if (host.mode === "apex") return;
    if (!user) {
      router.navigate({ to: otpChallengeStore.get() ? "/verify-otp" : "/login" });
      return;
    }
    router.navigate({ to: homeRouteForRole(user.role) });
  }, [user, loading, router, host.ready, host.mode]);

  if (host.ready && host.mode === "apex") {
    return <PublicLanding />;
  }

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}
