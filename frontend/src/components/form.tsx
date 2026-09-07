import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Field = ({ label, children, error, hint }: { label: string; children: ReactNode; error?: string; hint?: string }) => (
  <label className="block">
    <div className="text-xs font-medium text-foreground/80 mb-1.5">{label}</div>
    {children}
    {hint && !error && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    {error && <div className="text-[11px] text-destructive mt-1">{error}</div>}
  </label>
);

const inputBase =
  "w-full rounded-xl border border-input bg-card text-sm transition-all duration-200 " +
  "placeholder:text-muted-foreground/60 " +
  "hover:border-border " +
  "focus:outline-none focus:border-ring focus:ring-4 focus:ring-ring/15 " +
  "disabled:opacity-60 disabled:cursor-not-allowed";

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => (
    <input ref={ref} {...p} className={cn(inputBase, "h-11 px-3.5", className)} />
  )
);
TextInput.displayName = "TextInput";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => (
    <textarea ref={ref} {...p} className={cn(inputBase, "px-3.5 py-2.5 min-h-[96px] resize-y", className)} />
  )
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...p }, ref) => (
    <select ref={ref} {...p} className={cn(inputBase, "h-11 px-3.5 pr-9 appearance-none cursor-pointer", className)}>
      {children}
    </select>
  )
);
Select.displayName = "Select";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "outline";
  loading?: boolean;
  size?: "sm" | "md" | "lg";
};
export const Button = forwardRef<HTMLButtonElement, BtnProps>(
  ({ variant = "primary", size = "md", loading, className, children, disabled, ...p }, ref) => {
    const variants = {
      primary:
        "bg-gradient-primary text-primary-foreground shadow-soft hover:shadow-glow " +
        "before:absolute before:inset-0 before:rounded-[inherit] before:bg-gradient-to-b before:from-white/15 before:to-transparent before:opacity-0 hover:before:opacity-100 before:transition-opacity",
      secondary: "bg-secondary text-secondary-foreground border border-border/70 hover:bg-secondary/70 hover:border-border",
      ghost: "hover:bg-muted text-foreground",
      destructive: "bg-destructive text-destructive-foreground shadow-soft hover:opacity-95 hover:shadow-lift",
      outline: "border border-border bg-card hover:bg-muted hover:border-border",
    };
    const sizes = {
      sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
      md: "h-10 px-4 text-sm rounded-xl",
      lg: "h-11 px-5 text-sm rounded-xl",
    };
    return (
      <button
        ref={ref} disabled={disabled || loading}
        {...p}
        className={cn(
          "relative inline-flex items-center justify-center gap-2 font-semibold tracking-[-0.005em] transition-all duration-200",
          "active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30",
          variants[variant], sizes[size], className
        )}
      >
        {loading && <span className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin relative z-10" />}
        <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
      </button>
    );
  }
);
Button.displayName = "Button";
