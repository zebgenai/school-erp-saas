import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Lock, School } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  CHANGE_PASSWORD_ENDPOINT,
  buildChangePasswordRequest,
  FORCE_CHANGE_PASSWORD_PATH,
  PASSWORD_POLICY_MESSAGE,
  postAuthPath,
  shouldLeaveForcePasswordPage,
  validatePasswordChange,
} from "@/lib/force-password";
import { homeRouteForRole } from "@/lib/permissions";
import { Button, Field, TextInput } from "@/components/form";

export const Route = createFileRoute("/force-change-password")({
  head: () => ({ meta: [{ title: "Change Password — School ERP" }] }),
  component: ForceChangePasswordPage,
});

function ForceChangePasswordPage() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.navigate({ to: "/login" });
      return;
    }
    const leave = shouldLeaveForcePasswordPage(user, FORCE_CHANGE_PASSWORD_PATH, homeRouteForRole);
    if (leave) router.navigate({ to: leave as "/" });
  }, [user, loading, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const validationError = validatePasswordChange({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      await api.post(
        CHANGE_PASSWORD_ENDPOINT,
        buildChangePasswordRequest({ currentPassword, newPassword }),
      );
      await refresh();
      const me = await api.get<Record<string, unknown>>("/auth/me");
      const next = ((me as any)?.user || (me as any)?.data || me) as {
        forcePasswordChange?: boolean;
        role?: string;
      };
      if (next?.forcePasswordChange) {
        setError("Password was updated but a change is still required. Please try again.");
        return;
      }
      toast.success("Password updated successfully");
      router.navigate({ to: postAuthPath(next, homeRouteForRole) as "/" });
    } catch (err: any) {
      setError(err?.message || "Unable to change password");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="size-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-sidebar px-4">
      <div className="w-full max-w-md bg-card border rounded-3xl p-8 shadow-lift">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-12 rounded-2xl bg-gradient-primary grid place-items-center">
            <School className="size-6 text-primary-foreground" />
          </div>
          <div>
            <div className="font-bold text-lg">Password change required</div>
            <div className="text-xs text-muted-foreground">
              For security, you must set a new password before continuing.
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Current password">
            <TextInput
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="New password">
            <TextInput
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Confirm new password">
            <TextInput
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </Field>

          <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_MESSAGE}</p>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <Button type="submit" loading={saving} className="w-full">
            <KeyRound className="size-4" /> Update password
          </Button>
        </form>

        <p className="mt-4 text-xs text-muted-foreground flex items-center gap-1.5">
          <Lock className="size-3.5" />
          You will stay signed in while updating your password.
        </p>
      </div>
    </div>
  );
}
