import { School, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type AuthBrandHeaderProps = {
  title: string;
  subtitle: string;
  logoSrc?: string | null;
  variant?: "school" | "admin" | "default";
};

export function AuthBrandHeader({ title, subtitle, logoSrc, variant = "default" }: AuthBrandHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-8">
      {logoSrc ? (
        <img
          src={logoSrc}
          alt=""
          className="size-12 rounded-2xl object-contain bg-white/95 border border-white/20 shadow-soft shrink-0"
        />
      ) : (
        <div
          className={cn(
            "size-12 rounded-2xl grid place-items-center shadow-soft shrink-0",
            variant === "admin" ? "bg-foreground text-background" : "bg-gradient-primary",
          )}
        >
          {variant === "admin" ? (
            <Shield className="size-6" />
          ) : (
            <School className="size-6 text-primary-foreground" />
          )}
        </div>
      )}
      <div className="min-w-0">
        <div className="font-bold text-lg leading-tight truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
      </div>
    </div>
  );
}
