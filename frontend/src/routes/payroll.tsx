import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Wallet, Play, Printer, Download } from "lucide-react";
import { toastSuccess, toastError } from "@/lib/errors";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, StatusBadge, ErrorState } from "@/components/ui-kit";
import { Button, Field, Select, TextInput } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { pdfApi } from "@/lib/pdfUtils";

export const Route = createFileRoute("/payroll")({
  head: () => ({ meta: [{ title: "Payroll — School ERP" }] }),
  component: () => <AppShell><Payroll /></AppShell>,
});

/** Parse "YYYY-MM" into { month: number, year: number } */
function parseMonthYear(monthStr: string) {
  const [yr, mo] = monthStr.split("-");
  return { month: parseInt(mo, 10), year: parseInt(yr, 10) };
}

function Payroll() {
  const { can } = usePermissions();
  const canGenerate = can("payroll.manage");
  const canPay = can("payroll.manage");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { month: m, year: y } = parseMonthYear(month);
  const list = useApiQuery<any>(`/payroll`, { month: m, year: y });
  const [open, setOpen] = useState(false);
  const [confirmGen, setConfirmGen] = useState(false);
  const [pay, setPay] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = asList<any>(list.data);

  const generate = async () => {
    setBusy(true);
    try {
      const { month: mo, year: yr } = parseMonthYear(month);
      await api.post("/payroll/generate", { month: mo, year: yr });
      toastSuccess("Payroll generated successfully");
      setOpen(false); setConfirmGen(false); list.refetch();
    } catch (e: any) { toastError(e); } finally { setBusy(false); }
  };

  const markPaid = async (form: any) => {
    setBusy(true);
    try {
      await api.patch(`/payroll/${pay.id}/mark-paid`, {
        paidAt: form.paidOn,
        method: form.method || undefined,
        notes: form.note || undefined,
      });
      toastSuccess("Salary payment recorded successfully"); setPay(null); list.refetch();
    } catch (e: any) { toastError(e); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Payroll" description="Generate salary slips and track payments."
        actions={canGenerate ? <Button onClick={() => setOpen(true)}><Play className="size-4" /> Generate Payroll</Button> : undefined} />

      <Card className="mb-4">
        <Field label="Month">
          <TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-xs" />
        </Field>
      </Card>

      <Card className="p-0 overflow-hidden">
        {list.loading ? <div className="p-6 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> :
          list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> :
          rows.length === 0 ? <EmptyState icon={Wallet} title="No payroll for this month" description="No salary slips have been generated yet. Click Generate Payroll to create them." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Employee</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Type</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Basic</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Allowances</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Deductions</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Net</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const net = Number(
                      r.netSalary ??
                        Number(r.basicSalary || 0) + Number(r.allowances || 0) - Number(r.deductions || 0),
                    );
                    return (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{r.staffName || r.teacher?.fullName || r.staff?.fullName || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.staffType === "TEACHER" ? "Teacher" : "Staff"}</td>
                        <td className="px-4 py-3">{r.basicSalary ?? 0}</td>
                        <td className="px-4 py-3">{r.allowances ?? 0}</td>
                        <td className="px-4 py-3">{r.deductions ?? 0}</td>
                        <td className="px-4 py-3 font-semibold">{net}</td>
                        <td className="px-4 py-3"><StatusBadge status={r.status || "PENDING"} /></td>
                        <td className="px-4 py-3 text-right flex gap-2 justify-end">
                          <button onClick={() => pdfApi.salarySlip(r.id, `${r.staffName ?? "slip"}-${r.month}-${r.year}`.replace(/\s+/g, "-")).catch((e: any) => toast.error(e.message))} title="Download salary slip"
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition">
                            <Download className="w-4 h-4" />
                          </button>
                          <button onClick={() => pdfApi.printSalarySlip(r.id).catch((e: any) => toast.error(e.message))} title="Print salary slip"
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition">
                            <Printer className="w-4 h-4" />
                          </button>
                          {r.status !== "PAID" && canPay && <Button size="sm" variant="outline" onClick={() => setPay(r)}>Pay</Button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Generate Payroll" preventClose={busy}
        footer={<><Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button loading={busy} onClick={() => { setOpen(false); setConfirmGen(true); }}>Continue</Button></>}>
        <Field label="Month"><TextInput type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field>
        <p className="text-xs text-muted-foreground mt-3">This will generate salary slips for all active teachers and staff for the selected month.</p>
      </Modal>

      <ConfirmDialog open={confirmGen} onClose={() => setConfirmGen(false)} onConfirm={generate}
        title="Generate payroll?" message={`Generate salary slips for ${month}? This action creates payroll records for all active staff.`}
        confirmText="Generate" loading={busy} />

      {pay && <PayModal row={pay} onClose={() => setPay(null)} onSave={markPaid} loading={busy} />}
    </div>
  );
}

function PayModal({ row, onClose, onSave, loading }: any) {
  const [form, setForm] = useState({ method: "BANK", paidOn: new Date().toISOString().slice(0, 10), note: "" });
  return (
    <Modal open onClose={onClose} title={`Pay Salary · ${row.staffName || row.teacher?.fullName || row.staff?.fullName || ""}`} preventClose={loading}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={loading} onClick={() => onSave(form)}>Mark Paid</Button></>}>
      <div className="space-y-3">
        <Field label="Payment Method">
          <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="CASH">Cash</option><option value="BANK">Bank Transfer</option><option value="CHEQUE">Cheque</option>
          </Select>
        </Field>
        <Field label="Paid On"><TextInput type="date" value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} /></Field>
        <Field label="Note"><TextInput value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
