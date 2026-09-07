import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Bus, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, Skeleton, EmptyState, StatusBadge } from "@/components/ui-kit";
import { Button, Field, Select, TextInput } from "@/components/form";
import { Modal, ConfirmDialog } from "@/components/Modal";
import { CrudPage } from "@/components/CrudPage";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/transport")({
  head: () => ({ meta: [{ title: "Transport — School ERP" }] }),
  component: () => <AppShell><Transport /></AppShell>,
});

function Transport() {
  const { can } = usePermissions();
  const canManage = can("transport.manage");
  const [tab, setTab] = useState<"vehicles" | "routes" | "assignments">("vehicles");
  return (
    <div>
      <PageHeader title="Transport" description="Vehicles, routes, and student assignments." />
      <div className="inline-flex gap-1 p-1 bg-muted rounded-xl mb-4">
        {(["vehicles", "routes", "assignments"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${tab === t ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </div>
      {tab === "vehicles" && (
        <CrudPage title="" endpoint="/transport/vehicles" resourceName="vehicle" emptyIcon={Bus}
          canCreate={canManage} canEdit={canManage} canDelete={canManage}
          searchFields={["registrationNo", "model"]}
          columns={[
            { key: "registrationNo", label: "Reg No", mono: true },
            { key: "model", label: "Model" },
            { key: "capacity", label: "Capacity" },
            { key: "driverName", label: "Driver" },
            { key: "status", label: "Status", badge: true },
          ]}
          fields={[
            { key: "registrationNo", label: "Registration No", required: true },
            { key: "model", label: "Model" },
            { key: "capacity", label: "Capacity", type: "number" },
            { key: "driverName", label: "Driver Name" },
            { key: "status", label: "Status", type: "select", defaultValue: "ACTIVE",
              options: [{ label: "Active", value: "ACTIVE" }, { label: "Inactive", value: "INACTIVE" }] },
          ]} />
      )}
      {tab === "routes" && (
        <CrudPage title="" endpoint="/transport/routes" resourceName="route" emptyIcon={Bus}
          canCreate={canManage} canEdit={canManage} canDelete={canManage}
          searchFields={["name", "from", "to"]}
          columns={[
            { key: "name", label: "Route Name" },
            { key: "from", label: "From" },
            { key: "to", label: "To" },
            { key: "fare", label: "Fare" },
            { key: "vehicleNo", label: "Vehicle" },
          ]}
          fields={[
            { key: "name", label: "Route Name", required: true },
            { key: "from", label: "From" },
            { key: "to", label: "To" },
            { key: "fare", label: "Monthly Fare", type: "number" },
            { key: "vehicleNo", label: "Assigned Vehicle" },
            { key: "stops", label: "Stops", type: "textarea", full: true },
          ]} />
      )}
      {tab === "assignments" && <AssignmentsTab />}
    </div>
  );
}

function AssignmentsTab() {
  const { can } = usePermissions();
  const canManage = can("transport.manage");
  const list = useApiQuery<any>("/transport/assignments");
  const routes = useApiQuery<any>("/transport/routes");
  const students = useApiQuery<any>("/students");
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = asList<any>(list.data);

  const assign = async (form: any) => {
    setBusy(true);
    try {
      await api.post("/transport/assignments", {
        studentId: form.studentId,
        routeId: form.routeId,
        pickupPoint: form.pickupPoint || undefined,
        dropPoint: form.dropPoint || undefined,
        monthlyFee: form.monthlyFee ? Number(form.monthlyFee) : undefined,
      });
      toast.success("Student assigned to route");
      setOpen(false);
      list.refetch();
    } catch (e: any) {
      toast.error(e.message || "Assignment failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await api.delete(`/transport/assignments/${del.id}`);
      toast.success("Assignment removed");
      setDel(null);
      list.refetch();
    } catch (e: any) {
      toast.error(e.message || "Remove failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="font-semibold">Student Route Assignments</div>
        {canManage && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Assign Student</Button>}
      </div>
      {list.loading ? (
        <div className="p-6 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Bus} title="No assignments yet" description="Assign students to transport routes." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-3 font-medium text-muted-foreground">Student</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Route</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Pickup</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Drop</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Fee</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                {canManage && <th></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{r.student?.fullName || r.studentName || "—"}</td>
                  <td className="px-4 py-3">{r.route?.name || r.routeName || "—"}</td>
                  <td className="px-4 py-3">{r.pickupPoint || "—"}</td>
                  <td className="px-4 py-3">{r.dropPoint || "—"}</td>
                  <td className="px-4 py-3">{r.monthlyFee ?? "—"}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status || "ACTIVE"} /></td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDel(r)} className="size-8 inline-grid place-items-center rounded-lg hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Assign Student to Route"
        footer={<Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>}>
        <AssignmentForm
          routes={asList(routes.data)}
          students={asList(students.data)}
          onSubmit={assign}
          busy={busy}
        />
      </Modal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy}
        title="Remove assignment?" message="This student will no longer be on this route." />
    </Card>
  );
}

function AssignmentForm({ routes, students, onSubmit, busy }: any) {
  const [f, setF] = useState({ studentId: "", routeId: "", pickupPoint: "", dropPoint: "", monthlyFee: "" });
  const submit = () => {
    if (!f.studentId) return toast.error("Select a student");
    if (!f.routeId) return toast.error("Select a route");
    if (!f.pickupPoint?.trim()) return toast.error("Pickup point is required");
    if (!f.dropPoint?.trim()) return toast.error("Drop point is required");
    onSubmit(f);
  };
  return (
    <div className="space-y-3">
      <Field label="Student">
        <Select value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })}>
          <option value="">Select…</option>
          {students.map((s: any) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
        </Select>
      </Field>
      <Field label="Route">
        <Select value={f.routeId} onChange={(e) => setF({ ...f, routeId: e.target.value })}>
          <option value="">Select…</option>
          {routes.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </Field>
      <Field label="Pickup Point"><TextInput value={f.pickupPoint} onChange={(e) => setF({ ...f, pickupPoint: e.target.value })} /></Field>
      <Field label="Drop Point"><TextInput value={f.dropPoint} onChange={(e) => setF({ ...f, dropPoint: e.target.value })} /></Field>
      <Field label="Monthly Fee"><TextInput type="number" value={f.monthlyFee} onChange={(e) => setF({ ...f, monthlyFee: e.target.value })} /></Field>
      <div className="pt-2"><Button loading={busy} onClick={submit}>Assign</Button></div>
    </div>
  );
}
