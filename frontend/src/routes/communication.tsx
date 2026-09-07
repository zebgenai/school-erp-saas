import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Megaphone } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui-kit";
import { CrudPage } from "@/components/CrudPage";
import { usePermissions } from "@/lib/permissions";

const TYPES = [
  { label: "Announcement", value: "ANNOUNCEMENT" },
  { label: "Notice", value: "NOTICE" },
  { label: "Event", value: "EVENT" },
  { label: "Circular", value: "CIRCULAR" },
];

export const Route = createFileRoute("/communication")({
  head: () => ({ meta: [{ title: "Communication — School ERP" }] }),
  component: () => <AppShell><Communication /></AppShell>,
});

function Communication() {
  const { can } = usePermissions();
  const canManage = can("communication.manage");
  const [tab, setTab] = useState("ANNOUNCEMENT");
  return (
    <div>
      <PageHeader title="Communication" description="Broadcast announcements, notices, events, and circulars." />
      <div className="inline-flex gap-1 p-1 bg-muted rounded-xl mb-4 flex-wrap">
        {TYPES.map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.value ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
        ))}
      </div>
      <CrudPage key={tab}
        title=""
        endpoint="/communication"
        listParams={{ type: tab }}
        resourceName={TYPES.find((t) => t.value === tab)?.label || "item"}
        emptyIcon={Megaphone}
        canCreate={canManage}
        canEdit={canManage}
        canDelete={canManage}
        searchFields={["title", "body"]}
        columns={[
          { key: "title", label: "Title" },
          { key: "audience", label: "Audience" },
          { key: "publishDate", label: "Date" },
          { key: "status", label: "Status", badge: true },
        ]}
        fields={[
          { key: "title", label: "Title", required: true },
          { key: "type", label: "Type", type: "select", defaultValue: tab, options: TYPES },
          { key: "audience", label: "Audience", type: "select", defaultValue: "ALL", options: [
            { label: "All", value: "ALL" }, { label: "Students", value: "STUDENTS" },
            { label: "Parents", value: "PARENTS" }, { label: "Teachers", value: "TEACHERS" }, { label: "Staff", value: "STAFF" },
          ]},
          { key: "publishDate", label: "Publish Date", type: "date" },
          { key: "expiryDate", label: "Expiry Date", type: "date" },
          { key: "status", label: "Status", type: "select", defaultValue: "ACTIVE",
            options: [{ label: "Active", value: "ACTIVE" }, { label: "Draft", value: "DRAFT" }] },
          { key: "body", label: "Message", type: "textarea", full: true, required: true },
        ]} />
    </div>
  );
}
