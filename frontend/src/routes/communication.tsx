import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Megaphone, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, PageHeader, StatusBadge } from "@/components/ui-kit";
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
import { asList, useApiQuery } from "@/lib/hooks";
import { usePermissions } from "@/lib/permissions";

export const Route = createFileRoute("/communication")({
  head: () => ({ meta: [{ title: "Communication — School ERP" }] }),
  component: () => (
    <AppShell>
      <Communication />
    </AppShell>
  ),
});

function Communication() {
  const { can, role } = usePermissions();
  const canManage = can("communication.manage");
  const isAdmin = role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN";
  const [tab, setTab] = useState("ANNOUNCEMENT");
  const tabs = [
    ...NOTICE_TYPES,
    ...(isAdmin ? [{ value: "WHATSAPP_ATTENDANCE", label: "WhatsApp Attendance" }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Communication"
        description="Broadcast announcements, notices, events, and WhatsApp attendance alerts."
      />
      <div className="inline-flex gap-1 p-1 bg-muted rounded-xl mb-4 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.value ? "bg-card shadow-soft" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "WHATSAPP_ATTENDANCE" ? (
        <WhatsAppAttendanceLog />
      ) : (
        <CrudPage
          key={tab}
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
            {
              key: "targetRoles",
              label: "Audience",
              render: (r: any) => formatTargetRoles(r.targetRoles),
            },
            {
              key: "startDate",
              label: "Date",
              render: (r: any) => r.startDate?.toString().slice(0, 10) || "—",
            },
            {
              key: "isPublished",
              label: "Status",
              render: (r: any) => (
                <StatusBadge status={r.isPublished ? "ACTIVE" : "DRAFT"} />
              ),
            },
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
      )}
    </div>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case "PENDING":
    case "PROCESSING":
    case "RETRYING":
      return "Pending";
    case "SENT":
      return "Sent";
    case "DELIVERED":
      return "Delivered";
    case "READ":
      return "Read";
    case "FAILED":
      return "Failed";
    case "SKIPPED":
      return "Skipped";
    default:
      return status;
  }
}

function WhatsAppAttendanceLog() {
  const logs = useApiQuery<any>("/notifications/logs/whatsapp-attendance", { limit: 50 });
  const items = asList<any>(logs.data?.items ?? logs.data);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="size-4" />
        <h3 className="font-semibold text-sm">WhatsApp absence notifications</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Parent WhatsApp messages created when a student is marked absent. Enable the channel in
        Settings → Notification Channels.
      </p>
      {logs.loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No WhatsApp attendance notifications yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3 font-medium">Student</th>
                <th className="py-2 pr-3 font-medium">Parent</th>
                <th className="py-2 pr-3 font-medium">Recipient</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Created</th>
                <th className="py-2 font-medium">Delivered</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((row: any) => (
                <tr key={row.id}>
                  <td className="py-2.5 pr-3">{row.student?.fullName || "—"}</td>
                  <td className="py-2.5 pr-3">{row.parent?.fullName || "—"}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs">{row.recipient || "—"}</td>
                  <td className="py-2.5 pr-3">
                    <span
                      className={
                        row.status === "FAILED"
                          ? "text-destructive"
                          : row.status === "SENT" ||
                              row.status === "DELIVERED" ||
                              row.status === "READ"
                            ? "text-green-600"
                            : "text-muted-foreground"
                      }
                    >
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                    {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                  </td>
                  <td className="py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                    {row.deliveredAt ? new Date(row.deliveredAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
