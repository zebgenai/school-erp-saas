import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, Receipt, Wallet, TrendingUp, AlertCircle, FileText, Download, Printer, History } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, StatusBadge, ErrorState } from "@/components/ui-kit";
import { toastSuccess, toastError } from "@/lib/errors";
import { Button, Field, Select, TextInput } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList, asObj } from "@/lib/hooks";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermissions } from "@/lib/permissions";
import { pdfApi } from "@/lib/pdfUtils";

export const Route = createFileRoute("/fees")({
  head: () => ({ meta: [{ title: "Fees — School ERP" }] }),
  component: () => <AppShell><FeesPage /></AppShell>,
});

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface BulkInvoiceResult {
  created: number;
  skipped: number;
  invoiceIds: string[];
  invoiceNos: string[];
  month: number;
  year: number;
}

/** Outstanding balance, preferring the value the API reports. */
function pendingOf(invoice: any): number {
  if (invoice?.pendingAmount != null) return Number(invoice.pendingAmount);
  const total = Number(invoice?.totalAmount ?? invoice?.amount ?? 0);
  const paid = Number(invoice?.paidAmount ?? 0);
  return Math.max(total - paid, 0);
}

function FeesPage() {
  const [tab, setTab] = useState<"invoices" | "structures" | "defaulters">("invoices");
  const summary = useApiQuery<any>("/fees/reports/summary");
  const s = asObj<any>(summary.data);

  return (
    <div>
      <PageHeader title="Fees" description="Track invoices, payments, and fee structures." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {summary.error ? (
          <div className="col-span-full"><ErrorState message={summary.error} onRetry={summary.refetch} /></div>
        ) : (
        [
          { label: "Collected", v: s.totalPaid, icon: TrendingUp, color: "text-emerald-600 bg-emerald-500/10" },
          { label: "Pending", v: s.totalPending, icon: Wallet, color: "text-amber-600 bg-amber-500/10" },
          { label: "Invoices", v: s.totalInvoices, icon: FileText, color: "text-blue-600 bg-blue-500/10" },
          { label: "Defaulters", v: (s.unpaidInvoices ?? 0) + (s.partialInvoices ?? 0), icon: AlertCircle, color: "text-rose-600 bg-rose-500/10" },
        ].map((c) => (
          <Card key={c.label} hover>
            <div className="flex items-center gap-3">
              <div className={`size-10 rounded-xl grid place-items-center ${c.color}`}><c.icon className="size-5" /></div>
              <div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className="text-xl font-bold">{summary.loading ? <Skeleton className="h-7 w-12 inline-block" /> : (c.v ?? 0)}</div>
              </div>
            </div>
          </Card>
        ))
        )}
      </div>

      <div className="inline-flex gap-1 p-1 bg-muted rounded-xl mb-4">
        {(["invoices", "structures", "defaulters"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${tab === t ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </div>

      {tab === "invoices" && <InvoicesTab />}
      {tab === "structures" && <StructuresTab />}
      {tab === "defaulters" && <DefaultersTab />}
    </div>
  );
}

function InvoicesTab() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canManage = can("fees.manage");
  const schoolName: string = (user as any)?.school?.name || (user as any)?.schoolName || "School ERP";
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const list = useApiQuery<any>("/fees/invoices", {
    status: status || undefined,
    limit: PAGE_SIZE,
    skip: page * PAGE_SIZE,
  });
  const [genOpen, setGenOpen] = useState(false);
  const [confirmGen, setConfirmGen] = useState(false);
  const [genMonth, setGenMonth] = useState("");
  const [pay, setPay] = useState<any | null>(null);
  const [history, setHistory] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = asList<any>(list.data);
  const total = (list.data as any)?.total ?? rows.length;

  const generate = async (monthStr: string) => {
    setBusy(true);
    try {
      const [yr, mo] = monthStr.split("-");
      const month = parseInt(mo, 10);
      const year = parseInt(yr, 10);
      const res = await api.post<BulkInvoiceResult>("/fees/invoices/bulk", { month, year });
      const ids = res?.invoiceIds ?? [];

      if (ids.length === 0) {
        toast.info(
          res?.skipped
            ? `No new invoices — all ${res.skipped} active students already have one for this month.`
            : "No invoices were generated.",
        );
      } else {
        toast.success(
          `${ids.length} monthly invoice${ids.length === 1 ? "" : "s"} generated. Downloading…`,
        );
      }

      setGenOpen(false);
      list.refetch();

      // Downloading only the invoices this run created; a download problem must not be
      // reported as a generation failure.
      if (ids.length > 0) {
        try {
          if (ids.length === 1) await pdfApi.feeInvoice(ids[0], res?.invoiceNos?.[0]);
          else await pdfApi.feeInvoiceArchive(ids, `${MONTH_NAMES[month - 1]}-${year}-Invoices.zip`);
        } catch (e: any) {
          toast.error(`Invoices were created but the download failed: ${e.message}`);
        }
      }
    } catch (e: any) { toastError(e); }
    finally { setBusy(false); }
  };

  const recordPay = async (form: any) => {
    const pending = pendingOf(pay);
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Payment amount must be greater than zero");
      return;
    }
    if (amount > pending) {
      toast.error(`Amount cannot exceed pending balance (${pending})`);
      return;
    }
    setBusy(true);
    try {
      await api.post("/fees/payments", {
        invoiceId: pay.id,
        amount,
        method: form.method,
        paymentDate: form.paymentDate || undefined,
        notes: form.note || undefined,
      });
      toast.success("Fee payment recorded successfully");
      setPay(null); list.refetch();
    } catch (e: any) { toastError(e); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 justify-between p-4 border-b">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="max-w-xs">
          <option value="">All statuses</option>
          <option value="PAID">Paid</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PARTIAL">Partial</option>
        </Select>
        <div className="flex gap-2">
          {canManage && (
            <Button variant="outline" onClick={() => setGenOpen(true)}><Plus className="size-4" /> Generate Monthly Invoices</Button>
          )}
        </div>
      </div>

      {list.loading ? <div className="p-6 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> :
        list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> :
        rows.length === 0 ? <EmptyState icon={Receipt} title="No invoices yet" description="Generate monthly invoices or record payments to get started." /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left"><tr>
              <th className="px-4 py-3 font-medium text-muted-foreground">Invoice</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Student</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Month</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Total</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Paid</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Pending</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3"></th>
            </tr></thead>
            <tbody>
              {rows.map((i) => {
                const total = Number(i.totalAmount ?? i.amount ?? 0);
                const paid = Number(i.paidAmount ?? i.paid ?? 0);
                const pending = pendingOf(i);
                // API returns payments ordered by paymentDate descending.
                const payments = Array.isArray(i.payments) ? i.payments : [];
                const latestPayment = payments[0] ?? null;
                return (
                  <tr key={i.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{i.invoiceNo || i.id?.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-medium">{i.student?.fullName || i.studentName}</td>
                    <td className="px-4 py-3">{i.month}</td>
                    <td className="px-4 py-3">{total}</td>
                    <td className="px-4 py-3">{paid}</td>
                    <td className="px-4 py-3">{pending}</td>
                    <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {canManage && i.status !== "PAID" && (
                          <Button size="sm" variant="outline" onClick={() => setPay(i)}>
                            {i.status === "PARTIAL" ? "Record Payment" : "Mark as Paid"}
                          </Button>
                        )}
                        {paid > 0 && (
                          <button
                            title="Payment history"
                            onClick={() => setHistory(i)}
                            className="size-8 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition"
                          >
                            <History className="size-4" />
                          </button>
                        )}
                        <button
                          title="Download PDF"
                          onClick={() => pdfApi.feeInvoice(i.id, i.invoiceNo).catch((e) => toast.error(e.message))}
                          className="size-8 grid place-items-center rounded-lg hover:bg-primary/10 hover:text-primary transition"
                        >
                          <Download className="size-4" />
                        </button>
                        <button
                          title="Print PDF"
                          onClick={() => pdfApi.printFeeInvoice(i.id).catch((e) => toast.error(e.message))}
                          className="size-8 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition"
                        >
                          <Printer className="size-4" />
                        </button>
                        {latestPayment && (
                          <>
                            <button
                              title={`Download receipt ${latestPayment.receiptNo ?? ""}`}
                              onClick={() => pdfApi.feeReceipt(latestPayment.id, latestPayment.receiptNo).catch((e) => toast.error(e.message))}
                              className="size-8 grid place-items-center rounded-lg hover:bg-emerald-500/10 hover:text-emerald-600 transition"
                            >
                              <Receipt className="size-4" />
                            </button>
                            <button
                              title={`Print receipt ${latestPayment.receiptNo ?? ""}`}
                              onClick={() => pdfApi.printFeeReceipt(latestPayment.id).catch((e) => toast.error(e.message))}
                              className="size-8 grid place-items-center rounded-lg hover:bg-emerald-500/10 hover:text-emerald-600 transition"
                            >
                              <Printer className="size-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
              <span className="text-muted-foreground">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <GenerateModal open={genOpen} onClose={() => setGenOpen(false)} onGenerate={(m) => { setGenMonth(m); setGenOpen(false); setConfirmGen(true); }} loading={busy} />
      <ConfirmDialog open={confirmGen} onClose={() => setConfirmGen(false)} onConfirm={() => { generate(genMonth); setConfirmGen(false); }}
        title="Generate monthly invoices?" message="This will create fee invoices for all active students for the selected month. Existing invoices for that month may be skipped."
        confirmText="Generate" loading={busy} />
      {pay && <PaymentModal invoice={pay} onClose={() => setPay(null)} onSave={recordPay} loading={busy} />}
      {history && <PaymentHistoryModal invoice={history} onClose={() => setHistory(null)} />}
    </Card>
  );
}

function PaymentHistoryModal({ invoice, onClose }: { invoice: any; onClose: () => void }) {
  const detail = useApiQuery<any>(`/fees/invoices/${invoice.id}`);
  const data = asObj<any>(detail.data);
  const payments: any[] = Array.isArray(data.payments) ? data.payments : [];

  return (
    <Modal open onClose={onClose} title={`Payment History · ${invoice.student?.fullName || ""}`}
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="rounded-xl border bg-muted/30 p-4 mb-4 text-sm">
        <div className="flex justify-between"><span>Invoice</span><span className="font-mono text-xs">{invoice.invoiceNo}</span></div>
        <div className="flex justify-between"><span>Total</span><span>{data.totalAmount ?? invoice.totalAmount}</span></div>
        <div className="flex justify-between"><span>Paid</span><span>{data.paidAmount ?? invoice.paidAmount}</span></div>
        <div className="flex justify-between font-semibold"><span>Pending</span><span>{pendingOf(detail.data ? data : invoice)}</span></div>
      </div>

      {detail.loading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div> :
        detail.error ? <ErrorState message={detail.error} onRetry={detail.refetch} /> :
        payments.length === 0 ? <EmptyState icon={Receipt} title="No payments recorded" /> : (
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr>
            <th className="px-3 py-2 font-medium text-muted-foreground">Receipt</th>
            <th className="px-3 py-2 font-medium text-muted-foreground">Date</th>
            <th className="px-3 py-2 font-medium text-muted-foreground">Method</th>
            <th className="px-3 py-2 font-medium text-muted-foreground">Amount</th>
            <th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{p.receiptNo}</td>
                <td className="px-3 py-2">{p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "—"}</td>
                <td className="px-3 py-2">{p.method || "—"}</td>
                <td className="px-3 py-2 font-medium">{p.amount}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex justify-end gap-1">
                    <button title="Download receipt"
                      onClick={() => pdfApi.feeReceipt(p.id, p.receiptNo).catch((e) => toast.error(e.message))}
                      className="size-8 grid place-items-center rounded-lg hover:bg-emerald-500/10 hover:text-emerald-600 transition">
                      <Download className="size-4" />
                    </button>
                    <button title="Print receipt"
                      onClick={() => pdfApi.printFeeReceipt(p.id).catch((e) => toast.error(e.message))}
                      className="size-8 grid place-items-center rounded-lg hover:bg-muted transition">
                      <Printer className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function GenerateModal({ open, onClose, onGenerate, loading }: { open: boolean; onClose: () => void; onGenerate: (month: string) => void; loading: boolean }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  return (
    <Modal open={open} onClose={onClose} title="Generate Monthly Invoices" preventClose={loading}
      footer={<><Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button><Button loading={loading} onClick={() => onGenerate(month)}>Continue</Button></>}>
      <Field label="Month"><TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
      <p className="text-xs text-muted-foreground mt-3">This will generate fee invoices for all active students for the selected month.</p>
    </Modal>
  );
}

function PaymentModal({ invoice, onClose, onSave, loading }: any) {
  const total = Number(invoice.totalAmount ?? invoice.amount ?? 0);
  const paid = Number(invoice.paidAmount ?? invoice.paid ?? 0);
  const pending = pendingOf(invoice);
  const [form, setForm] = useState({
    amount: pending,
    method: "CASH",
    paymentDate: new Date().toISOString().slice(0, 10),
    note: "",
    feeStatus: "PAID",
  });
  // A second click while the first request is in flight would create a duplicate payment.
  const submitted = useRef(false);
  const amount = Number(form.amount);
  const isFullSettlement = amount === pending && pending > 0;

  const handleSave = () => {
    if (loading || submitted.current) return;
    if (form.feeStatus === "UNPAID") {
      onClose();
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Payment amount must be greater than zero");
    if (amount > pending) return toast.error(`Amount cannot exceed pending balance (${pending})`);
    submitted.current = true;
    onSave(form);
  };

  useEffect(() => {
    // Re-arm the guard if the request failed and the modal stayed open.
    if (!loading) submitted.current = false;
  }, [loading]);

  return (
    <Modal open onClose={onClose} preventClose={loading}
      title={`${invoice.status === "PARTIAL" ? "Record Payment" : "Mark as Paid"} · ${invoice.student?.fullName || ""}`}
      footer={<>
        <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button loading={loading} disabled={loading} onClick={handleSave}>
          {form.feeStatus === "UNPAID"
            ? "Leave Unpaid"
            : isFullSettlement ? "Mark as Paid" : "Save Payment"}
        </Button>
      </>}>
      <div className="rounded-xl border bg-muted/30 p-4 mb-4">
        <div className="text-xs text-muted-foreground">Receipt preview</div>
        <div className="font-semibold mt-1">{invoice.student?.fullName}</div>
        <div className="text-sm text-muted-foreground">Invoice {invoice.invoiceNo || invoice.id} · {MONTH_NAMES[(invoice.month ?? 1) - 1]} {invoice.year}</div>
        <div className="mt-2 flex justify-between text-sm"><span>Total</span><span>{total}</span></div>
        <div className="flex justify-between text-sm"><span>Paid</span><span>{paid}</span></div>
        <div className="flex justify-between font-semibold mt-1"><span>Pending</span><span>{pending}</span></div>
      </div>
      <div className="space-y-3">
        <Field label="Fee Status" hint="Paid records a cash payment. Unpaid leaves the invoice outstanding.">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={form.feeStatus === "PAID" ? "primary" : "outline"}
              onClick={() => setForm({ ...form, feeStatus: "PAID", amount: pending })}
            >
              Paid
            </Button>
            <Button
              type="button"
              variant={form.feeStatus === "UNPAID" ? "primary" : "outline"}
              onClick={() => setForm({ ...form, feeStatus: "UNPAID", amount: 0 })}
            >
              Unpaid
            </Button>
          </div>
        </Field>
        <Field label="Amount">
          <TextInput type="number" min={1} max={pending} value={form.amount} disabled={form.feeStatus === "UNPAID"}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value), feeStatus: "PAID" })} />
        </Field>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setForm({ ...form, amount: pending })}>Full amount ({pending})</Button>
          <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, amount: Math.max(Math.floor(pending / 2), 1) })}>Half</Button>
        </div>
        <Field label="Payment Method">
          <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="CASH">Cash</option><option value="BANK">Bank</option><option value="CARD">Card</option><option value="ONLINE">Online</option>
          </Select>
        </Field>
        <Field label="Payment Date">
          <TextInput type="date" value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
        </Field>
        <Field label="Notes / Reference"><TextInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        {form.feeStatus === "UNPAID"
          ? "No payment will be recorded. The invoice stays UNPAID."
          : isFullSettlement
            ? "This settles the invoice in full and marks it PAID."
            : `A partial payment leaves ${Math.max(pending - (Number.isFinite(amount) ? amount : 0), 0)} pending and marks the invoice PARTIAL.`}
      </p>
    </Modal>
  );
}

function StructuresTab() {
  const { can } = usePermissions();
  const canManage = can("fees.manage");
  const list = useApiQuery<any>("/fees/structures");
  const classes = useApiQuery<any>("/classes");
  const [modal, setModal] = useState<{ open: boolean; data: any | null }>({ open: false, data: null });
  const [del, setDel] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({ title: "", classId: "", amount: 0 });

  const open = (r: any | null) => {
    setForm(r ? { title: r.title ?? r.name ?? "", classId: r.classId ?? "", amount: r.amount ?? 0 } : { title: "", classId: "", amount: 0 });
    setModal({ open: true, data: r });
  };

  const save = async () => {
    if (!form.title?.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      const payload = { title: form.title, classId: form.classId || undefined, amount: Number(form.amount) || 0 };
      if (modal.data?.id) await api.patch(`/fees/structures/${modal.data.id}`, payload);
      else await api.post("/fees/structures", payload);
      toast.success("Saved"); setModal({ open: false, data: null }); list.refetch();
    } catch (e: any) { toastError(e); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api.delete(`/fees/structures/${del.id}`); toast.success("Deleted"); setDel(null); list.refetch(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const rows = asList<any>(list.data);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="font-semibold">Fee Structures</div>
        {canManage && <Button size="sm" onClick={() => open(null)}><Plus className="size-4" /> Add Structure</Button>}
      </div>
      {list.loading ? <div className="p-6 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div> :
        rows.length === 0 ? <EmptyState icon={Receipt} title="No fee structures" /> : (
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr>
            <th className="px-4 py-3 font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Class</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Amount</th>
            {canManage && <th></th>}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{r.title ?? r.name}</td>
                <td className="px-4 py-3">{r.class?.name || asList<any>(classes.data).find((c) => c.id === r.classId)?.name || "—"}</td>
                <td className="px-4 py-3">{r.amount}</td>
                {canManage && <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="ghost" onClick={() => open(r)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDel(r)}>Delete</Button>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={modal.open} onClose={() => setModal({ open: false, data: null })} title={`${modal.data ? "Edit" : "Add"} Fee Structure`}
        footer={<><Button variant="outline" onClick={() => setModal({ open: false, data: null })}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
        <div className="space-y-3">
          <Field label="Name"><TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Class">
            <Select value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
              <option value="">Select class</option>
              {asList<any>(classes.data).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Amount"><TextInput type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></Field>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} title="Delete structure?" message="This cannot be undone." />
    </Card>
  );
}

function DefaultersTab() {
  const list = useApiQuery<any>("/fees/reports/defaulters");
  const rows = asList<any>(list.data);
  return (
    <Card className="p-0 overflow-hidden">
      {list.loading ? <div className="p-6 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div> :
        rows.length === 0 ? <EmptyState icon={Wallet} title="No defaulters" description="All fees are up to date." /> : (
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr>
            <th className="px-4 py-3 font-medium text-muted-foreground">Student</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Class</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Invoice</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Pending</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Phone</th>
            <th className="px-4 py-3"></th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const student = r.student ?? {};
              const pending = Math.max(Number(r.totalAmount ?? 0) - Number(r.paidAmount ?? 0), 0);
              return (
                <tr key={r.id || i} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{student.fullName || "—"}</td>
                  <td className="px-4 py-3">{student.class?.name || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.invoiceNo || "—"}</td>
                  <td className="px-4 py-3 text-destructive font-semibold">{pending}</td>
                  <td className="px-4 py-3">{student.guardianPhone || "—"}</td>
                  <td className="px-4 py-3 text-right"><StatusBadge status={r.status || "UNPAID"} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}
