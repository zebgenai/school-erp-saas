import { useMemo, useState } from "react";
import { Layers, ArrowLeft, Link2 } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/errors";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/hooks";
import { Card, EmptyState, Skeleton } from "@/components/ui-kit";
import { Button, Field, Select } from "@/components/form";
import { cn } from "@/lib/utils";
import { FEATURE_ALIASES } from "@/lib/feature-control.ts";

type FeatureListRow = {
  key: string;
  name: string;
  description?: string | null;
  isCore: boolean;
  isGloballyEnabled: boolean;
  overrideCount: number;
  linkedTo?: string | null;
};

type SchoolOverrideRow = {
  schoolId: string;
  name: string;
  slug: string;
  status: string;
  override: "INHERIT" | "ON" | "OFF";
  isEnabled: boolean;
};

type FeatureDetail = {
  key: string;
  name: string;
  description?: string | null;
  isCore: boolean;
  isGloballyEnabled: boolean;
  linkedTo?: string | null;
  schools: SchoolOverrideRow[];
};

export function FeaturesControlTab() {
  const list = useApiQuery<FeatureListRow[]>("/features");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const detail = useApiQuery<FeatureDetail>(selectedKey ? `/features/${selectedKey}` : null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => (Array.isArray(list.data) ? list.data : []), [list.data]);

  if (selectedKey) {
    return (
      <FeatureDetailView
        detail={detail.data}
        loading={detail.loading}
        busy={busy}
        onBack={() => {
          setSelectedKey(null);
          list.refetch();
        }}
        onManageLinked={(canonical) => {
          setSelectedKey(canonical);
        }}
        onRefresh={() => detail.refetch()}
        setBusy={setBusy}
      />
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Layers className="size-5" /> Feature Control
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Enable or disable modules globally and per school. Core features cannot be turned off.
            Role permissions are unchanged. Results follows Exams.
          </p>
        </div>
      </div>

      {list.loading ? (
        <Skeleton className="h-48" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Layers} title="No features" description="Feature catalog is empty." />
      ) : (
        <div className="overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Feature</th>
                <th className="px-3 py-2 font-medium">Global</th>
                <th className="px-3 py-2 font-medium">School overrides</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((f) => {
                const linkedTo = f.linkedTo ?? FEATURE_ALIASES[f.key] ?? null;
                return (
                  <tr key={f.key} className="hover:bg-muted/30">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.key}
                        {f.isCore ? " · Core" : ""}
                        {linkedTo ? ` · Linked to ${linkedTo}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      {linkedTo ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Link2 className="size-3.5" /> Follows {linkedTo}
                        </span>
                      ) : (
                        <StatusPill on={f.isGloballyEnabled} />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {linkedTo
                        ? "—"
                        : `${f.overrideCount} override${f.overrideCount === 1 ? "" : "s"}`}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {linkedTo ? (
                        <Button size="sm" variant="outline" onClick={() => setSelectedKey(linkedTo)}>
                          Manage {linkedTo}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setSelectedKey(f.key)}>
                          Manage
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function FeatureDetailView({
  detail,
  loading,
  busy,
  onBack,
  onManageLinked,
  onRefresh,
  setBusy,
}: {
  detail: FeatureDetail | null;
  loading: boolean;
  busy: boolean;
  onBack: () => void;
  onManageLinked: (canonical: string) => void;
  onRefresh: () => void;
  setBusy: (v: boolean) => void;
}) {
  const linkedTo = detail?.linkedTo ?? (detail ? FEATURE_ALIASES[detail.key] : null) ?? null;

  const setGlobal = async (isGloballyEnabled: boolean) => {
    if (!detail || linkedTo) return;
    setBusy(true);
    try {
      await api.patch(`/features/${detail.key}/global`, { isGloballyEnabled });
      toastSuccess(isGloballyEnabled ? "Feature enabled globally" : "Feature disabled globally");
      onRefresh();
    } catch (e: any) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const setOverride = async (schoolId: string, mode: "INHERIT" | "ON" | "OFF") => {
    if (!detail || linkedTo) return;
    setBusy(true);
    try {
      if (mode === "INHERIT") {
        await api.delete(`/features/${detail.key}/schools/${schoolId}`);
      } else {
        await api.patch(`/features/${detail.key}/schools/${schoolId}`, {
          isEnabled: mode === "ON",
        });
      }
      toastSuccess("School override updated");
      onRefresh();
    } catch (e: any) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4" /> All features
      </Button>
      {loading || !detail ? (
        <Skeleton className="h-64" />
      ) : linkedTo ? (
        <Card>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="size-5" /> {detail.name}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            {detail.description || detail.key}
          </p>
          <p className="text-sm mb-4">
            Results is linked to <strong>Exams</strong> and has no independent ON/OFF state.
            Changing Exams also changes Results.
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground">Effective (follows Exams):</span>
            <StatusPill on={detail.isGloballyEnabled} />
          </div>
          <Button size="sm" onClick={() => onManageLinked(linkedTo)}>
            Manage Exams
          </Button>
        </Card>
      ) : (
        <>
          <Card>
            <h2 className="text-lg font-semibold">{detail.name}</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              {detail.description || detail.key}
              {detail.isCore ? " · Core feature" : ""}
              {detail.key === "exams" ? " · Results follows this feature" : ""}
            </p>
            <Field label="Global">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill on={detail.isGloballyEnabled} />
                <Button
                  size="sm"
                  disabled={busy || detail.isCore || detail.isGloballyEnabled}
                  onClick={() => setGlobal(true)}
                >
                  ON
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || detail.isCore || !detail.isGloballyEnabled}
                  onClick={() => setGlobal(false)}
                >
                  OFF
                </Button>
                {detail.isCore && (
                  <span className="text-xs text-muted-foreground">Core features cannot be disabled.</span>
                )}
              </div>
            </Field>
            {!detail.isGloballyEnabled && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-3">
                Global is OFF — effective state is OFF for every school, even if a school override is ON.
              </p>
            )}
          </Card>

          <Card>
            <h3 className="font-semibold mb-3">School Overrides</h3>
            <div className="overflow-auto rounded-xl border max-h-[28rem]">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-medium">School</th>
                    <th className="px-3 py-2 font-medium">Override</th>
                    <th className="px-3 py-2 font-medium">Effective</th>
                    <th className="px-3 py-2 font-medium">Set</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {detail.schools.map((s) => (
                    <tr key={s.schoolId}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{s.name}</div>
                        <div className="text-xs text-muted-foreground">{s.slug}</div>
                      </td>
                      <td className="px-3 py-2">
                        <OverridePill value={s.override} />
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill on={s.isEnabled} />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          className="h-9 min-w-[8rem]"
                          value={s.override}
                          disabled={busy}
                          onChange={(e) =>
                            setOverride(s.schoolId, e.target.value as "INHERIT" | "ON" | "OFF")
                          }
                        >
                          <option value="INHERIT">Inherit</option>
                          <option value="ON">ON</option>
                          <option value="OFF">OFF</option>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function StatusPill({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex px-2 py-0.5 rounded text-xs font-semibold",
        on ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800",
      )}
    >
      {on ? "ON" : "OFF"}
    </span>
  );
}

function OverridePill({ value }: { value: string }) {
  return (
    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-muted text-foreground">
      {value}
    </span>
  );
}
