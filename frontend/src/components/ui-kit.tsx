import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title, description, actions,
}: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, children, hover }: { className?: string; children: ReactNode; hover?: boolean }) {
  return (
    <div className={cn(
      "bg-card rounded-2xl shadow-card border border-border/60 p-5 transition-all duration-300",
      hover && "hover-lift hover:border-border",
      className
    )}>
      {children}
    </div>
  );
}

export function StaggerList({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial="hidden" animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}
      className="contents"
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.97 },
        show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-lg", className)} />;
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: any; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-16 px-4">
      {Icon && (
        <div className="mx-auto size-14 rounded-2xl bg-muted grid place-items-center mb-4">
          <Icon className="size-6 text-muted-foreground" />
        </div>
      )}
      <h3 className="font-semibold text-lg">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-center py-12 px-4">
      <p className="text-destructive font-medium">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 text-sm text-primary hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-success/10 text-success border-success/20",
  INACTIVE: "bg-muted text-muted-foreground border-border",
  PAID: "bg-success/10 text-success border-success/20",
  UNPAID: "bg-destructive/10 text-destructive border-destructive/20",
  PARTIAL: "bg-warning/15 text-warning-foreground border-warning/30",
  PRESENT: "bg-success/10 text-success border-success/20",
  ABSENT: "bg-destructive/10 text-destructive border-destructive/20",
  LATE: "bg-warning/15 text-warning-foreground border-warning/30",
  LEAVE: "bg-info/15 text-info border-info/30",
};

export function StatusBadge({ status }: { status?: string }) {
  const s = (status || "").toUpperCase();
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border",
      statusStyles[s] || "bg-muted text-muted-foreground border-border"
    )}>
      {s || "—"}
    </span>
  );
}
