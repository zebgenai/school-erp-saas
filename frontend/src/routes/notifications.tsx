import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Bell, Check, CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import {
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  StatusBadge,
} from "@/components/ui-kit";
import { Button } from "@/components/form";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — School ERP" }] }),
  component: () => (
    <AppShell>
      <NotificationsPage />
    </AppShell>
  ),
});

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  body: string;
  type: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  category: string;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string | null;
  linkUrl?: string | null;
};

function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const limit = 20;

  const fetchPage = useCallback(
    async (off: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.get<{
          items?: NotificationItem[];
          total?: number;
          unreadCount?: number;
        }>(`/notifications?limit=${limit}&offset=${off}`);
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setUnread(data.unreadCount ?? 0);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load notifications");
      } finally {
        setLoading(false);
      }
    },
    [limit],
  );

  useEffect(() => {
    fetchPage(offset);
  }, [offset, fetchPage]);

  const markRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnread((c) => Math.max(0, c - 1));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await api.patch("/notifications/read-all");
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
      toast.success("All notifications marked as read");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setMarkingAll(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/notifications/${id}`);
      setItems((prev) => prev.filter((n) => n.id !== id));
      setTotal((t) => t - 1);
      toast.success("Notification deleted");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const openNotification = (n: NotificationItem) => {
    if (!n.isRead) markRead(n.id);
    const url = n.actionUrl ?? n.linkUrl;
    if (url) navigate({ to: url });
  };

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(d).toLocaleDateString();
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={`${unread} unread · ${total} total`}
        actions={
          unread > 0 ? (
            <Button variant="outline" size="sm" loading={markingAll} onClick={markAllRead}>
              <CheckCheck className="size-4" /> Mark all read
            </Button>
          ) : undefined
        }
      />

      <Card>
        {loading && items.length === 0 ? (
          <div className="space-y-3 p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => fetchPage(offset)} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="You'll see updates about students, fees, attendance, and more here."
          />
        ) : (
          <>
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    "px-4 py-4 flex items-start gap-3 hover:bg-muted/30 transition cursor-pointer",
                    !n.isRead && "bg-primary/5",
                  )}
                  onClick={() => openNotification(n)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn("text-sm", !n.isRead && "font-semibold")}>{n.title}</p>
                      <StatusBadge status={n.type} />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {n.category}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{n.message ?? n.body}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!n.isRead && (
                      <button
                        type="button"
                        title="Mark read"
                        onClick={(e) => {
                          e.stopPropagation();
                          markRead(n.id);
                        }}
                        className="p-2 rounded-lg hover:bg-muted"
                      >
                        <Check className="size-4 text-muted-foreground" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(n.id);
                      }}
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0 || loading}
                    onClick={() => setOffset((o) => Math.max(0, o - limit))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset + limit >= total || loading}
                    onClick={() => setOffset((o) => o + limit)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <p className="text-xs text-muted-foreground mt-4 text-center">
        <Link to="/dashboard" className="text-primary hover:underline">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
