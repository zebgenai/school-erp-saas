import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Megaphone } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader, StatusBadge } from "@/components/ui-kit";
import { CrudPage } from "@/components/CrudPage";
import { api } from "@/lib/api";
import {
  NOTICE_TYPES,
  buildNoticePayload,
  formatTargetRoles,
  noticeFormFields,
  parseIsPublished,
  syncNoticePublishState,
  toNoticeFormValues,
} from "@/lib/communication-notice-form";
import { usePermissions } from "@/lib/permissions";

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
        {NOTICE_TYPES.map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.value ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
        ))}
      </div>
      <CrudPage key={tab}
        title=""
        endpoint="/communication"
        listParams={{ type: tab }}
        resourceName={NOTICE_TYPES.find((t) => t.value === tab)?.label || "item"}
        emptyIcon={Megaphone}
        canCreate={canManage}
        canEdit={canManage}
        canDelete={canManage}
        searchFields={["title", "content"]}
        columns={[
          { key: "title", label: "Title" },
          { key: "targetRoles", label: "Audience", render: (r: any) => formatTargetRoles(r.targetRoles) },
          { key: "startDate", label: "Date", render: (r: any) => r.startDate?.toString().slice(0, 10) || "—" },
          { key: "isPublished", label: "Status", render: (r: any) => <StatusBadge status={r.isPublished ? "ACTIVE" : "DRAFT"} /> },
        ]}
        fields={noticeFormFields(tab)}
        toFormValues={toNoticeFormValues}
        preparePayload={(form) => buildNoticePayload(form)}
        afterSave={async (saved, form, row) => {
          const noticeId = saved?.id || row?.id;
          if (!noticeId) return;
          await syncNoticePublishState({
            noticeId,
            wasPublished: Boolean(row?.isPublished),
            wantPublished: parseIsPublished(form.isPublished),
            publish: (id) => api.patch(`/communication/${id}/publish`),
            unpublish: (id) => api.patch(`/communication/${id}/unpublish`),
          });
        }}
      />
    </div>
  );
}
