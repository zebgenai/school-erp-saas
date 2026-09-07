import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Book, BookOpen, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, StatusBadge, Skeleton, EmptyState, ErrorState } from "@/components/ui-kit";
import { Button, Field, Select, TextInput } from "@/components/form";
import { Modal } from "@/components/Modal";
import { CrudPage } from "@/components/CrudPage";
import { useApiQuery, asList } from "@/lib/hooks";
import { api } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/library")({
  head: () => ({ meta: [{ title: "Library — School ERP" }] }),
  component: () => <AppShell><Library /></AppShell>,
});

function Library() {
  const [tab, setTab] = useState<"books" | "issues">("books");
  return (
    <div>
      <PageHeader title="Library" description="Manage books, issues, returns, and fines." />
      <div className="inline-flex gap-1 p-1 bg-muted rounded-xl mb-4">
        {(["books", "issues"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${tab === t ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </div>
      {tab === "books" ? <Books /> : <Issues />}
    </div>
  );
}

function Books() {
  const { can } = usePermissions();
  const canManage = can("library.manage");
  return (
    <CrudPage
      title=""
      endpoint="/library/books"
      resourceName="book"
      emptyIcon={Book}
      canCreate={canManage}
      canEdit={canManage}
      canDelete={canManage}
      searchFields={["title", "author", "category", "isbn"]}
      columns={[
        { key: "title", label: "Title" },
        { key: "author", label: "Author" },
        { key: "category", label: "Category" },
        { key: "isbn", label: "ISBN", mono: true },
        { key: "quantity", label: "Total" },
        { key: "available", label: "Available" },
      ]}
      fields={[
        { key: "title", label: "Title", required: true },
        { key: "author", label: "Author" },
        { key: "category", label: "Category" },
        { key: "isbn", label: "ISBN" },
        { key: "publisher", label: "Publisher" },
        { key: "quantity", label: "Total Quantity", type: "number" },
        { key: "available", label: "Available", type: "number" },
        { key: "shelf", label: "Shelf / Location" },
      ]}
    />
  );
}

function Issues() {
  const { can } = usePermissions();
  const canManage = can("library.manage");
  const list = useApiQuery<any>("/library/issues");
  const books = useApiQuery<any>("/library/books");
  const students = useApiQuery<any>("/students");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = asList<any>(list.data);

  const issue = async (form: any) => {
    setBusy(true);
    try { await api.post("/library/issues", form); toast.success("Book issued"); setOpen(false); list.refetch(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const returnBook = async (id: string) => {
    setBusy(true);
    try { await api.patch(`/library/issues/${id}/return`, {}); toast.success("Returned"); list.refetch(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="font-semibold">Book Issues</div>
        {canManage && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Issue Book</Button>}
      </div>
      {list.loading ? <div className="p-6 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div> :
        list.error ? <ErrorState message={list.error} onRetry={list.refetch} /> :
        rows.length === 0 ? <EmptyState icon={BookOpen} title="No issues yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Book</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Student</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Issued</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Due</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Fine</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{r.book?.title || r.bookTitle}</td>
                    <td className="px-4 py-3">{r.student?.fullName || r.studentName}</td>
                    <td className="px-4 py-3">{r.issueDate}</td>
                    <td className="px-4 py-3">{r.dueDate}</td>
                    <td className="px-4 py-3">{r.fine || 0}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status || "ISSUED"} /></td>
                    <td className="px-4 py-3 text-right">
                      {canManage && r.status !== "RETURNED" && <Button size="sm" variant="outline" onClick={() => returnBook(r.id)}>Return</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <Modal open={open} onClose={() => setOpen(false)} title="Issue Book"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button></>}>
        <IssueForm books={asList(books.data)} students={asList(students.data)} onSubmit={issue} busy={busy} />
      </Modal>
    </Card>
  );
}

function IssueForm({ books, students, onSubmit, busy }: any) {
  const [f, setF] = useState({ bookId: "", studentId: "", issueDate: new Date().toISOString().slice(0, 10), dueDate: "" });
  const submit = () => {
    if (!f.bookId) return toast.error("Select a book");
    if (!f.studentId) return toast.error("Select a student");
    if (!f.dueDate) return toast.error("Due date is required");
    if (f.dueDate < f.issueDate) return toast.error("Due date cannot be before issue date");
    onSubmit(f);
  };
  return (
    <div className="space-y-3">
      <Field label="Book">
        <Select value={f.bookId} onChange={(e) => setF({ ...f, bookId: e.target.value })}>
          <option value="">Select…</option>
          {books.map((b: any) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </Select>
      </Field>
      <Field label="Student">
        <Select value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })}>
          <option value="">Select…</option>
          {students.map((s: any) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
        </Select>
      </Field>
      <Field label="Issue Date"><TextInput type="date" value={f.issueDate} onChange={(e) => setF({ ...f, issueDate: e.target.value })} /></Field>
      <Field label="Due Date"><TextInput type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
      <div className="pt-2"><Button loading={busy} onClick={submit}>Issue</Button></div>
    </div>
  );
}
