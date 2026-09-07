import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus, Search, Edit2, Trash2, Wallet, Eye,
  Tag, BarChart2, ArrowUpRight, ArrowDownRight, Download, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, ErrorState, StatusBadge } from "@/components/ui-kit";
import { Button, Field, Select, TextInput, Textarea } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { pdfApi } from "@/lib/pdfUtils";

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [{ title: "Expenses — School ERP" }] }),
  component: () => <AppShell><Expenses /></AppShell>,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = { id: string; name: string; description?: string; isActive: boolean };
type Expense = {
  id: string; title: string; amount: number; date: string;
  description?: string; receiptUrl?: string; status: string;
  categoryId: string; category?: Category;
};

const emptyExpense = {
  title: "", categoryId: "", amount: 0, date: new Date().toISOString().slice(0, 10),
  description: "", receiptUrl: "", status: "ACTIVE",
};

const emptyCategory = { name: "", description: "" };

// ─── Page ────────────────────────────────────────────────────────────────────

function Expenses() {
  const [tab, setTab] = useState<"expenses" | "categories">("expenses");

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Track operational costs and manage expense categories."
      />

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 bg-muted/50 rounded-xl p-1 w-fit">
        {(["expenses", "categories"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
              tab === t
                ? "bg-card shadow-card text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "expenses" ? (
              <span className="flex items-center gap-1.5"><Wallet className="size-3.5" /> Expenses</span>
            ) : (
              <span className="flex items-center gap-1.5"><Tag className="size-3.5" /> Categories</span>
            )}
          </button>
        ))}
      </div>

      {tab === "expenses" ? <ExpensesTab /> : <CategoriesTab />}
    </div>
  );
}

// ─── Expenses Tab ────────────────────────────────────────────────────────────

function ExpensesTab() {
  const { can } = usePermissions();
  const canManage = can("expenses.manage");
  const canDelete = canManage;
  const list = useApiQuery<Expense[]>("/expenses");
  const categories = useApiQuery<Category[]>("/expenses/categories");

  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; data: Expense | null }>({ open: false, data: null });
  const [view, setView] = useState<Expense | null>(null);
  const [del, setDel] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const catList = asList<Category>(categories.data);
  const catMap = useMemo(
    () => Object.fromEntries(catList.map((c) => [c.id, c.name])),
    [catList],
  );

  const expenses = useMemo(() => {
    return asList<Expense>(list.data).filter((e) => {
      const text = `${e.title || ""} ${e.description || ""}`.toLowerCase();
      if (search && !text.includes(search.toLowerCase())) return false;
      if (categoryFilter && e.categoryId !== categoryFilter) return false;
      if (month && year) {
        const d = new Date(e.date);
        if (d.getMonth() + 1 !== Number(month) || d.getFullYear() !== Number(year)) return false;
      }
      return true;
    });
  }, [list.data, search, categoryFilter, month, year]);

  const totalAmount = useMemo(
    () => expenses.reduce((sum, e) => sum + (e.amount || 0), 0),
    [expenses],
  );

  const save = async (form: any) => {
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount) || 0 };
      if (modal.data?.id) {
        await api.patch(`/expenses/${modal.data.id}`, payload);
        toast.success("Expense updated");
      } else {
        await api.post("/expenses", payload);
        toast.success("Expense added");
      }
      setModal({ open: false, data: null });
      list.refetch();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      await api.delete(`/expenses/${del.id}`);
      toast.success("Expense deleted");
      setDel(null);
      list.refetch();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  return (
    <div>
      {/* Summary card */}
      {expenses.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          <Card hover>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Total ({MONTHS[Number(month) - 1]} {year})
                </div>
                <div className="text-2xl font-bold mt-1">PKR {totalAmount.toLocaleString()}</div>
              </div>
              <div className="size-11 rounded-xl bg-destructive/10 grid place-items-center">
                <ArrowUpRight className="size-5 text-destructive" />
              </div>
            </div>
          </Card>
          <Card hover>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Transactions
                </div>
                <div className="text-2xl font-bold mt-1">{expenses.length}</div>
              </div>
              <div className="size-11 rounded-xl bg-primary/10 grid place-items-center">
                <BarChart2 className="size-5 text-primary" />
              </div>
            </div>
          </Card>
          <Card hover>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Avg per Entry
                </div>
                <div className="text-2xl font-bold mt-1">
                  PKR {expenses.length ? Math.round(totalAmount / expenses.length).toLocaleString() : 0}
                </div>
              </div>
              <div className="size-11 rounded-xl bg-success/10 grid place-items-center">
                <ArrowDownRight className="size-5 text-success" />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <TextInput
              placeholder="Search expenses…"
              className="pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div className="flex gap-2">
            <Select value={month} onChange={(e) => setMonth(e.target.value)} className="flex-1">
              {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
            </Select>
            <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-24">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
        </div>
      </Card>

      {/* Add button + table */}
      <div className="flex justify-end mb-3 gap-2">
        <Button variant="outline" onClick={() => pdfApi.expenseReport({ month: Number(month), year: Number(year) }).catch((e) => toast.error(e.message))}>
          <Download className="size-4" /> Download PDF
        </Button>
        <Button variant="outline" onClick={() => pdfApi.printExpenseReport({ month: Number(month), year: Number(year) }).catch((e) => toast.error(e.message))}>
          <Printer className="size-4" /> Print PDF
        </Button>
        {canManage && (
        <Button onClick={() => setModal({ open: true, data: null })}>
          <Plus className="size-4" /> Add Expense
        </Button>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        {list.loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.refetch} />
        ) : expenses.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No expenses yet"
            description="Add your first expense entry to start tracking."
            action={
              canManage ? (
              <Button onClick={() => setModal({ open: true, data: null })}>
                <Plus className="size-4" /> Add Expense
              </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Title</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Category</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-t hover:bg-muted/30 transition">
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {new Date(e.date).toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3 font-medium">{e.title}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium">
                        {e.category?.name || catMap[e.categoryId] || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-destructive">
                      PKR {Number(e.amount).toLocaleString()}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={e.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setView(e)}
                          className="size-8 grid place-items-center rounded-lg hover:bg-muted"
                          title="View"
                        >
                          <Eye className="size-4" />
                        </button>
                        {canManage && (
                        <button
                          onClick={() => setModal({ open: true, data: e })}
                          className="size-8 grid place-items-center rounded-lg hover:bg-muted"
                          title="Edit"
                        >
                          <Edit2 className="size-4" />
                        </button>
                        )}
                        {canDelete && (
                        <button
                          onClick={() => setDel(e)}
                          className="size-8 grid place-items-center rounded-lg hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t bg-muted/30 flex justify-end text-sm font-semibold">
              Total: PKR {totalAmount.toLocaleString()}
            </div>
          </div>
        )}
      </Card>

      {/* Create / Edit */}
      {modal.open && (
        <ExpenseForm
          initial={modal.data}
          categories={catList}
          onClose={() => setModal({ open: false, data: null })}
          onSave={save}
          saving={saving}
          isEdit={!!modal.data}
        />
      )}

      {/* View */}
      <Modal open={!!view} onClose={() => setView(null)} title={view?.title || "Expense"} size="md">
        {view && (
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <Info label="Title" value={view.title} />
            <Info label="Category" value={view.category?.name || catMap[view.categoryId]} />
            <Info label="Amount" value={`PKR ${Number(view.amount).toLocaleString()}`} />
            <Info label="Date" value={new Date(view.date).toLocaleDateString()} />
            <Info label="Status" value={<StatusBadge status={view.status} />} />
            {view.receiptUrl && (
              <Info label="Receipt" value={
                <a href={view.receiptUrl} target="_blank" rel="noreferrer" className="text-primary underline text-xs">
                  View Receipt
                </a>
              } />
            )}
            {view.description && (
              <div className="sm:col-span-2"><Info label="Description" value={view.description} /></div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete */}
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={remove}
        loading={deleting}
        title="Delete expense?"
        message={`"${del?.title}" — PKR ${del?.amount?.toLocaleString()} will be permanently removed.`}
      />
    </div>
  );
}

// ─── Expense Form ─────────────────────────────────────────────────────────────

function ExpenseForm({
  initial, categories, onClose, onSave, saving, isEdit,
}: {
  initial: Expense | null;
  categories: Category[];
  onClose: () => void;
  onSave: (f: any) => void;
  saving: boolean;
  isEdit: boolean;
}) {
  const [f, setF] = useState({ ...emptyExpense, ...(initial || {}), date: initial?.date?.slice(0, 10) || emptyExpense.date });
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title?.trim()) return toast.error("Title is required");
    if (!f.categoryId) return toast.error("Please select a category");
    if (!f.amount || Number(f.amount) <= 0) return toast.error("Amount must be greater than 0");
    if (!f.date) return toast.error("Date is required");
    onSave(f);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit Expense" : "Add Expense"}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>
            {isEdit ? "Save changes" : "Add Expense"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <Field label="Title *">
          <TextInput
            value={f.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Electricity Bill"
          />
        </Field>
        <Field label="Category *">
          <Select value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">Select category</option>
            {categories.filter((c) => c.isActive).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (PKR) *">
          <TextInput
            type="number"
            min={1}
            value={f.amount}
            onChange={(e) => set("amount", e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Date *">
          <TextInput
            type="date"
            value={f.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </Field>
        <Field label="Receipt URL">
          <TextInput
            value={f.receiptUrl}
            onChange={(e) => set("receiptUrl", e.target.value)}
            placeholder="https://…"
          />
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="ACTIVE">Active</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description">
            <Textarea
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Additional details…"
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

// ─── Categories Tab ───────────────────────────────────────────────────────────

function CategoriesTab() {
  const { can } = usePermissions();
  const canManage = can("expenses.manage");
  const list = useApiQuery<Category[]>("/expenses/categories");

  const [modal, setModal] = useState<{ open: boolean; data: Category | null }>({ open: false, data: null });
  const [del, setDel] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const categories = asList<Category>(list.data);

  const save = async (form: any) => {
    setSaving(true);
    try {
      if (modal.data?.id) {
        await api.patch(`/expenses/categories/${modal.data.id}`, form);
        toast.success("Category updated");
      } else {
        await api.post("/expenses/categories", form);
        toast.success("Category created");
      }
      setModal({ open: false, data: null });
      list.refetch();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      await api.delete(`/expenses/categories/${del.id}`);
      toast.success("Category deleted");
      setDel(null);
      list.refetch();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        {canManage && <Button onClick={() => setModal({ open: true, data: null })}>
          <Plus className="size-4" /> Add Category
        </Button>}
      </div>

      <Card className="p-0 overflow-hidden">
        {list.loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.refetch} />
        ) : categories.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="No categories yet"
            description="Create categories to organise your expenses."
            action={
              canManage ? (
              <Button onClick={() => setModal({ open: true, data: null })}>
                <Plus className="size-4" /> Add Category
              </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Description</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/30 transition">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.description || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.isActive ? "ACTIVE" : "INACTIVE"} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {canManage && <button
                          onClick={() => setModal({ open: true, data: c })}
                          className="size-8 grid place-items-center rounded-lg hover:bg-muted"
                          title="Edit"
                        >
                          <Edit2 className="size-4" />
                        </button>}
                        {canManage && <button
                          onClick={() => setDel(c)}
                          className="size-8 grid place-items-center rounded-lg hover:bg-destructive/10 hover:text-destructive"
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal.open && (
        <CategoryForm
          initial={modal.data}
          onClose={() => setModal({ open: false, data: null })}
          onSave={save}
          saving={saving}
          isEdit={!!modal.data}
        />
      )}

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={remove}
        loading={deleting}
        title="Delete category?"
        message={`"${del?.name}" will be deleted. This fails if expenses are linked to it.`}
      />
    </div>
  );
}

// ─── Category Form ────────────────────────────────────────────────────────────

function CategoryForm({
  initial, onClose, onSave, saving, isEdit,
}: {
  initial: Category | null;
  onClose: () => void;
  onSave: (f: any) => void;
  saving: boolean;
  isEdit: boolean;
}) {
  const [f, setF] = useState({ ...emptyCategory, isActive: true, ...(initial || {}) });
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name?.trim()) return toast.error("Category name is required");
    onSave(f);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? "Edit Category" : "Add Category"}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>
            {isEdit ? "Save changes" : "Create"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name *">
          <TextInput
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Utilities"
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Optional description…"
          />
        </Field>
        {isEdit && (
          <Field label="Status">
            <Select
              value={f.isActive ? "true" : "false"}
              onChange={(e) => set("isActive", e.target.value === "true")}
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
        )}
      </form>
    </Modal>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}
