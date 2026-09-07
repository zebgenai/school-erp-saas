import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Save, School, Bell, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader } from "@/components/ui-kit";
import { Button, Field, TextInput, Textarea } from "@/components/form";
import { useAuth } from "@/lib/auth";
import { api, authorizedFetch, getApiBaseUrl, resolveFileUrl } from "@/lib/api";
import { useApiQuery, asList } from "@/lib/hooks";
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — School ERP" }] }),
  component: () => <AppShell><Settings /></AppShell>,
});

function Settings() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canManage = can("settings.manage");
  const school = useApiQuery<any>("/schools/mine");
  const [f, setF] = useState({
    name: "", address: "", phone: "", email: "", themeColor: "#6366f1",
    emailNotificationsEnabled: true,
    smsNotificationsEnabled: false,
    whatsappNotificationsEnabled: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = school.data as any;
    if (s) {
      setF({
        name: s.name || "",
        address: s.address || "",
        phone: s.phone || "",
        email: s.email || "",
        themeColor: s.themeColor || "#6366f1",
        emailNotificationsEnabled: s.emailNotificationsEnabled ?? true,
        smsNotificationsEnabled: s.smsNotificationsEnabled ?? false,
        whatsappNotificationsEnabled: s.whatsappNotificationsEnabled ?? false,
      });
    }
  }, [school.data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return toast.error("You do not have permission to edit settings");
    if (!f.name?.trim()) return toast.error("School name is required");
    setSaving(true);
    try {
      const schoolId = (user as any)?.schoolId || (user as any)?.school?.id;
      if (!schoolId) throw new Error("School not found");
      await api.patch(`/schools/${schoolId}`, {
        name: f.name || undefined,
        address: f.address || undefined,
        phone: f.phone || undefined,
        email: f.email || undefined,
        themeColor: f.themeColor || undefined,
        emailNotificationsEnabled: f.emailNotificationsEnabled,
        smsNotificationsEnabled: f.smsNotificationsEnabled,
        whatsappNotificationsEnabled: f.whatsappNotificationsEnabled,
      });
      toast.success("Settings saved");
      school.refetch();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Manage your school profile and preferences." />

      <form onSubmit={save} className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="font-semibold mb-4">School Profile</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Field label="School Name *"><TextInput value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!canManage} /></Field></div>
            <Field label="Email"><TextInput type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} disabled={!canManage} /></Field>
            <Field label="Phone"><TextInput value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} disabled={!canManage} /></Field>
            <div className="sm:col-span-2"><Field label="Address"><Textarea value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} disabled={!canManage} /></Field></div>
            <Field label="Theme Color">
              <div className="flex items-center gap-3">
                <input type="color" value={f.themeColor} onChange={(e) => setF({ ...f, themeColor: e.target.value })}
                  className="size-10 rounded-lg border cursor-pointer bg-card" />
                <TextInput value={f.themeColor} onChange={(e) => setF({ ...f, themeColor: e.target.value })} />
              </div>
            </Field>
          </div>
          {canManage && (
          <div className="mt-6 flex justify-end">
            <Button type="submit" loading={saving}><Save className="size-4" /> Save Changes</Button>
          </div>
          )}
        </Card>

        <div className="space-y-6">
        <Card>
          <h3 className="font-semibold mb-4 flex items-center gap-2"><Bell className="size-4" /> Notification Channels</h3>
          <p className="text-xs text-muted-foreground mb-4">Control which outbound channels this school uses. SMTP/SMS/WhatsApp credentials are configured in Platform Settings.</p>
          <div className="space-y-3">
            {[
              { key: "emailNotificationsEnabled" as const, label: "Email Notifications", desc: "Admission, invoices, receipts, attendance, results" },
              { key: "smsNotificationsEnabled" as const, label: "SMS Notifications", desc: "Fee reminders, attendance alerts, result alerts" },
              { key: "whatsappNotificationsEnabled" as const, label: "WhatsApp Notifications", desc: "Fee reminders, attendance alerts, result alerts" },
            ].map((ch) => (
              <label key={ch.key} className="flex items-center justify-between gap-4 p-3 rounded-lg border hover:bg-muted/30 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">{ch.label}</div>
                  <div className="text-xs text-muted-foreground">{ch.desc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={f[ch.key]}
                  onChange={(e) => setF({ ...f, [ch.key]: e.target.checked })}
                  className="size-4 rounded border"
                />
              </label>
            ))}
          </div>
        </Card>

        <NotificationPreferences />

        <Card>
          <h3 className="font-semibold mb-4">Logo</h3>
          <LogoUpload schoolId={(user as any)?.schoolId || (user as any)?.school?.id} logoUrl={(school.data as any)?.logoUrl} canManage={canManage} onUploaded={() => school.refetch()} />
        </Card>

        <NotificationAuditLog />
        </div>
      </form>
    </div>
  );
}

function LogoUpload({ schoolId, logoUrl, canManage, onUploaded }: { schoolId?: string; logoUrl?: string; canManage: boolean; onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!schoolId || !canManage) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await authorizedFetch(`${getApiBaseUrl()}/uploads/school/${schoolId}/logo`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      toast.success("Logo updated");
      onUploaded();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="aspect-square rounded-2xl border-2 border-dashed grid place-items-center bg-muted/30 overflow-hidden relative">
      {logoUrl ? (
        <img src={resolveFileUrl(logoUrl)} alt="School logo" className="w-full h-full object-contain p-4" />
      ) : (
        <School className="size-16 text-muted-foreground/40" />
      )}
      {canManage && (
        <>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button type="button" size="sm" variant="outline" className="absolute bottom-3" loading={uploading}
            onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" /> {logoUrl ? "Change" : "Upload"}
          </Button>
        </>
      )}
    </div>
  );
}

function NotificationPreferences() {
  const prefs = useApiQuery<any[]>("/notifications/preferences");
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const list = Array.isArray(prefs.data) ? prefs.data : [];
    const map: Record<string, boolean> = {};
    list.forEach((p: any) => {
      map[p.category] = p.inAppEnabled ?? true;
    });
    setLocal(map);
  }, [prefs.data]);

  const categories = [
    { key: "FEE", label: "Fees" },
    { key: "ATTENDANCE", label: "Attendance" },
    { key: "EXAM", label: "Exams" },
    { key: "PAYROLL", label: "Payroll" },
    { key: "LIBRARY", label: "Library" },
    { key: "TRANSPORT", label: "Transport" },
    { key: "ANNOUNCEMENT", label: "Announcements" },
    { key: "STUDENT", label: "Students" },
    { key: "SYSTEM", label: "System" },
  ];

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/notifications/preferences", {
        preferences: categories.map((c) => ({
          category: c.key,
          inAppEnabled: local[c.key] ?? true,
        })),
      });
      toast.success("Notification preferences saved");
      prefs.refetch();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <h3 className="font-semibold mb-2 text-sm">My Notification Preferences</h3>
      <p className="text-xs text-muted-foreground mb-4">Choose which in-app notification categories you receive.</p>
      {prefs.loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="space-y-2">
            {categories.map((c) => (
              <label key={c.key} className="flex items-center justify-between gap-4 p-2.5 rounded-lg border hover:bg-muted/30 cursor-pointer">
                <span className="text-sm">{c.label}</span>
                <input
                  type="checkbox"
                  checked={local[c.key] ?? true}
                  onChange={(e) => setLocal({ ...local, [c.key]: e.target.checked })}
                  className="size-4 rounded border"
                />
              </label>
            ))}
          </div>
          <Button type="button" size="sm" className="mt-4 w-full" loading={saving} onClick={save}>
            Save Preferences
          </Button>
        </>
      )}
    </Card>
  );
}

function NotificationAuditLog() {
  const { role } = usePermissions();
  const isAdmin = role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN";
  const logs = useApiQuery<any>(isAdmin ? "/notifications/logs/audit" : null, { limit: 10 });

  if (!isAdmin) return null;

  const items = asList<any>(logs.data?.items ?? logs.data);

  return (
    <Card>
      <h3 className="font-semibold mb-3 text-sm">Recent Notification Log</h3>
      {logs.loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No notifications sent yet.</p>
      ) : (
        <ul className="divide-y text-xs max-h-48 overflow-y-auto">
          {items.map((l: any) => (
            <li key={l.id} className="py-2 flex justify-between gap-2">
              <div className="min-w-0">
                <span className="font-medium">{l.channel}</span>
                <span className="text-muted-foreground ml-1">· {l.eventType || "—"}</span>
                <div className="text-muted-foreground truncate">{l.recipient}</div>
              </div>
              <span className={l.status === "SENT" ? "text-green-600" : l.status === "FAILED" ? "text-destructive" : "text-muted-foreground"}>
                {l.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
