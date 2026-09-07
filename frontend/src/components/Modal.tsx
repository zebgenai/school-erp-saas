import { type ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export function Modal({
  open, onClose, title, description, children, footer, size = "md", preventClose,
}: {
  open: boolean; onClose: () => void; title: string; description?: string;
  children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl";
  preventClose?: boolean;
}) {
  const safeClose = () => { if (!preventClose) onClose(); };

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && safeClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, preventClose, onClose]);

  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={safeClose}
            className="absolute inset-0 bg-foreground/50 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className={`relative bg-card rounded-2xl shadow-lift border border-border/70 w-full ${widths[size]} max-h-[90vh] flex flex-col overflow-hidden`}
          >
            <div className="flex items-start justify-between p-5 sm:p-6 border-b border-border/70 bg-gradient-subtle">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
              </div>
              <button onClick={safeClose} disabled={preventClose} className="size-9 grid place-items-center rounded-xl hover:bg-muted transition shrink-0 disabled:opacity-40" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 sm:p-6 overflow-y-auto flex-1">{children}</div>
            {footer && <div className="p-4 sm:px-6 border-t border-border/70 bg-muted/40 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmText = "Delete", loading,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: string; confirmText?: string; loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" preventClose={loading}
      footer={
        <>
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-lg border hover:bg-muted text-sm disabled:opacity-60">Cancel</button>
          <button
            disabled={loading}
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {loading && <span className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />}
            {confirmText}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">{message}</p>
    </Modal>
  );
}
