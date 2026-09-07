import { useMemo, useState, type ReactNode } from "react";
import { Plus, Search, Edit2, Trash2, Eye, Download, X } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/errors";
import { Card, PageHeader, Skeleton, EmptyState, ErrorState, StatusBadge } from "@/components/ui-kit";
import { Button, Field, TextInput, Select, Textarea } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";

export type Column<T = any> = {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  badge?: boolean;
  mono?: boolean;
};

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select" | "tel" | "email";
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  full?: boolean;
  placeholder?: string;
  defaultValue?: any;
};

export type CrudConfig<T = any> = {
  title: string;
  description?: string;
  endpoint: string;
  listParams?: Record<string, any>;
  resourceName?: string;
  searchFields?: string[];
  columns: Column<T>[];
  fields: FieldDef[];
  emptyIcon?: any;
  extraActions?: ReactNode;
  filters?: Array<{ key: string; label: string; options: Array<{ label: string; value: string }> }>;
  rowKey?: (row: T) => string;
  exportable?: boolean;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
};

export function CrudPage<T extends Record<string, any>>(cfg: CrudConfig<T>) {
  const canCreate = cfg.canCreate === true;
  const canEdit = cfg.canEdit === true;
  const canDelete = cfg.canDelete === true;
  const list = useApiQuery<any>(cfg.endpoint, { limit: 200, ...cfg.listParams });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<{ open: boolean; data: T | null }>({ open: false, data: null });
  const [view, setView] = useState<T | null>(null);
  const [del, setDel] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const allRows = asList<T>(list.data);
  const hasFilters = Boolean(search || Object.values(filters).some(Boolean));

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (search) {
        const t = (cfg.searchFields || Object.keys(r))
          .map((k) => String((r as any)[k] || "")).join(" ").toLowerCase();
        if (!t.includes(search.toLowerCase())) return false;
      }
      for (const [k, v] of Object.entries(filters)) {
        if (v && String((r as any)[k]) !== v) return false;
      }
      return true;
    });
  }, [allRows, search, filters, cfg.searchFields]);

  const resource = cfg.resourceName || "record";

  const save = async (form: any) => {
    setSaving(true);
    try {
      const id = (modal.data as any)?.id;
      if (id) {
        await api.patch(`${cfg.endpoint}/${id}`, form);
        toastSuccess(`${resource} updated successfully`);
      } else {
        await api.post(cfg.endpoint, form);
        toastSuccess(`${resource} created successfully`);
      }
      setModal({ open: false, data: null });
      list.refetch();
    } catch (e: any) {
      toastError(e, "Save failed");
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      await api.delete(`${cfg.endpoint}/${(del as any).id}`);
      toastSuccess(`${resource} deleted successfully`);
      setDel(null);
      list.refetch();
    } catch (e: any) {
      toastError(e, "Delete failed");
    } finally { setDeleting(false); }
  };

  const exportCsv = () => {
    if (!rows.length) return toastError("Nothing to export");
    const keys = cfg.columns.map((c) => c.key);
    const head = cfg.columns.map((c) => c.label).join(",");
    const body = rows.map((r) => keys.map((k) => JSON.stringify((r as any)[k] ?? "")).join(",")).join("\n");
    const blob = new Blob([head + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${resource}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title={cfg.title}
        description={cfg.description}
        actions={
          <>
            {cfg.exportable !== false && (
              <Button variant="outline" onClick={exportCsv}><Download className="size-4" /> Export</Button>
            )}
            {cfg.extraActions}
            {canCreate && (
              <Button onClick={() => setModal({ open: true, data: null })}>
                <Plus className="size-4" /> Add {resource}
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <div className={`relative ${cfg.filters?.length ? "sm:col-span-2" : "sm:col-span-4"}`}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <TextInput placeholder={`Search ${resource}…`} className="pl-10 pr-10" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 size-6 grid place-items-center rounded-md hover:bg-muted text-muted-foreground" aria-label="Clear search">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {cfg.filters?.map((f) => (
            <Select key={f.key} value={filters[f.key] || ""} onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })}>
              <option value="">{f.label}</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          ))}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {list.loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.refetch} />
        ) : rows.length === 0 ? (
          hasFilters && allRows.length > 0 ? (
            <EmptyState icon={cfg.emptyIcon} title="No matching results" description={`No ${resource}s match your search or filters.`}
              action={<Button variant="outline" onClick={() => { setSearch(""); setFilters({}); }}>Clear filters</Button>} />
          ) : (
          <EmptyState icon={cfg.emptyIcon} title={`No ${resource}s yet`} description={`No ${resource}s have been added yet.`}
            action={canCreate ? (
              <Button onClick={() => setModal({ open: true, data: null })}><Plus className="size-4" /> Add {resource}</Button>
            ) : undefined} />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  {cfg.columns.map((c) => (
                    <th key={c.key} className="px-4 py-3 font-medium text-muted-foreground">{c.label}</th>
                  ))}
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const key = cfg.rowKey ? cfg.rowKey(r) : (r as any).id || idx;
                  return (
                    <tr key={key} className="border-t hover:bg-muted/30 transition">
                      {cfg.columns.map((c) => {
                        const v = c.render ? c.render(r) : (r as any)[c.key];
                        return (
                          <td key={c.key} className={`px-4 py-3 ${c.mono ? "font-mono text-xs" : ""}`}>
                            {c.badge ? <StatusBadge status={String(v ?? "")} /> : (v ?? "—")}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setView(r)} title="View"
                            className="size-8 grid place-items-center rounded-lg hover:bg-muted"><Eye className="size-4" /></button>
                          {canEdit && (
                            <button onClick={() => setModal({ open: true, data: r })} title="Edit"
                              className="size-8 grid place-items-center rounded-lg hover:bg-muted"><Edit2 className="size-4" /></button>
                          )}
                          {canDelete && (
                            <button onClick={() => setDel(r)} title="Delete"
                              className="size-8 grid place-items-center rounded-lg hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal.open && (
        <CrudForm
          initial={modal.data}
          fields={cfg.fields}
          title={`${modal.data ? "Edit" : "Add"} ${resource}`}
          onClose={() => setModal({ open: false, data: null })}
          onSave={save}
          saving={saving}
        />
      )}

      <Modal open={!!view} onClose={() => setView(null)} title={String((view as any)?.name || (view as any)?.fullName || resource)} size="lg">
        {view && (
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            {cfg.fields.map((f) => (
              <div key={f.key} className={f.full ? "sm:col-span-2" : ""}>
                <div className="text-xs text-muted-foreground">{f.label}</div>
                <div className="font-medium mt-0.5">{String((view as any)[f.key] ?? "—")}</div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={deleting}
        title={`Delete ${resource}?`} message="This action cannot be undone." />
    </div>
  );
}

function CrudForm({ initial, fields, title, onClose, onSave, saving }: any) {
  const defaults = useMemo(() => {
    const d: any = {};
    fields.forEach((f: FieldDef) => { d[f.key] = f.defaultValue ?? ""; });
    return d;
  }, [fields]);
  const [f, setF] = useState<any>({ ...defaults, ...(initial || {}) });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    for (const fd of fields as FieldDef[]) {
      if (fd.required && !String(f[fd.key] ?? "").trim()) {
        return toastError(`${fd.label} is required`);
      }
    }
    // Only declared fields are submitted. Spreading the whole row would also send server
    // -owned columns and included relations, which the API rejects as unknown properties.
    const payload: any = {};
    for (const fd of fields as FieldDef[]) {
      payload[fd.key] = fd.type === "number" ? Number(f[fd.key]) || 0 : f[fd.key];
    }
    onSave(payload);
  };

  return (
    <Modal open onClose={onClose} title={title} size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{initial ? "Save changes" : "Create"}</Button>
        </>
      }>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        {(fields as FieldDef[]).map((fd) => (
          <div key={fd.key} className={fd.full || fd.type === "textarea" ? "sm:col-span-2" : ""}>
            <Field label={fd.label + (fd.required ? " *" : "")}>
              {fd.type === "textarea" ? (
                <Textarea value={f[fd.key] || ""} onChange={(e) => set(fd.key, e.target.value)} placeholder={fd.placeholder} />
              ) : fd.type === "select" ? (
                <Select value={f[fd.key] || ""} onChange={(e) => set(fd.key, e.target.value)}>
                  <option value="">Select…</option>
                  {fd.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              ) : (
                <TextInput
                  type={fd.type === "date" ? "date" : fd.type === "number" ? "number" : fd.type === "email" ? "email" : fd.type === "tel" ? "tel" : "text"}
                  value={fd.type === "date" ? String(f[fd.key] || "").slice(0, 10) : (f[fd.key] ?? "")}
                  onChange={(e) => set(fd.key, e.target.value)}
                  placeholder={fd.placeholder}
                />
              )}
            </Field>
          </div>
        ))}
      </form>
    </Modal>
  );
}
