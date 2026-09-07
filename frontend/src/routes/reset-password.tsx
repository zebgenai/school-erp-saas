import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, School } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button, Field, TextInput } from "@/components/form";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Reset Password — Clever Campus" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const router = useRouter();
  const token = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return toast.error("Invalid or missing reset token");
    if (password !== confirm) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password reset successfully");
      router.navigate({ to: "/login" });
    } catch (err: any) {
      toast.error(err?.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-sidebar px-4">
      <div className="w-full max-w-md bg-card border rounded-3xl p-8 shadow-lift">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-12 rounded-2xl bg-gradient-primary grid place-items-center">
            <School className="size-6 text-primary-foreground" />
          </div>
          <div>
            <div className="font-bold text-lg">Clever Campus</div>
            <div className="text-xs text-muted-foreground">Set a new password</div>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="New Password">
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </Field>
          <Field label="Confirm Password">
            <TextInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </Field>
          <Button type="submit" loading={loading} className="w-full">
            <Lock className="size-4" /> Reset Password
          </Button>
        </form>
      </div>
    </div>
  );
}
