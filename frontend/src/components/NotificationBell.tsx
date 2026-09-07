import { memo, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApiQuery } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui-kit";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  message?: string;
  type?: string;
  category?: string;
  eventType: string;
  linkUrl?: string | null;
  actionUrl?: string | null;
  isRead: boolean;
  createdAt: string;
};

export const NotificationBell = memo(function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const countQuery = useApiQuery<{ count: number }>("/notifications/unread-count", undefined, {
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const unread = countQuery.data?.count ?? 0;

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ items?: NotificationItem[]; unreadCount?: number }>(
        "/notifications",
        { limit: 20 },
      );
      setItems(data.items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      countQuery.refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const markAllRead = async () => {
    setLoading(true);
    try {
      await api.patch("/notifications/read-all");
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      countQuery.refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const openItem = (n: NotificationItem) => {
    if (!n.isRead) markRead(n.id);
    const url = n.actionUrl ?? n.linkUrl;
    if (url) {
      setOpen(false);
      navigate({ to: url });
    }
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="size-9 grid place-items-center rounded-xl hover:bg-muted transition relative"
        aria-label="Notifications"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full grid place-items-center ring-2 ring-background">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <span className="font-semibold text-sm">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={loading}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="py-8 px-4 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <button type="button" onClick={fetchNotifications} className="text-xs text-primary mt-2 hover:underline">
                  Retry
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No notifications yet</div>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "px-4 py-3 border-b last:border-0 hover:bg-muted/40 transition cursor-pointer",
                    !n.isRead && "bg-primary/5",
                  )}
                  onClick={() => openItem(n)}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn("text-sm truncate", !n.isRead && "font-semibold")}>{n.title}</p>
                        {!n.isRead && (
                          <button
                            type="button"
                            title="Mark read"
                            onClick={(e) => {
                              e.stopPropagation();
                              markRead(n.id);
                            }}
                            className="shrink-0 p-1 rounded hover:bg-muted"
                          >
                            <Check className="size-3.5 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message ?? n.body}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 border-t bg-muted/20">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-primary font-medium hover:underline block text-center"
            >
              View All Notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
});
