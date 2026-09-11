import { useEffect, useState } from "react";
import { api, getApiBaseUrl } from "@/lib/api";

export type PublicSchoolBranding = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  theme: string | null;
};

export function publicSchoolLogoUrl(slug: string): string {
  return `${getApiBaseUrl()}/public/schools/${encodeURIComponent(slug)}/logo`;
}

export function resolvePublicLogoSrc(logo: string | null | undefined, slug?: string | null): string | null {
  if (logo && /^https?:\/\//i.test(logo)) return logo;
  if (logo?.startsWith("/")) {
    if (logo.startsWith("/api/")) return logo;
    return `${getApiBaseUrl()}${logo.replace(/^\/api/, "")}`;
  }
  if (slug) return publicSchoolLogoUrl(slug);
  return null;
}

export function applySchoolTheme(color?: string | null) {
  if (typeof document === "undefined") return;
  if (color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim())) {
    document.documentElement.style.setProperty("--primary", color.trim());
  } else {
    document.documentElement.style.removeProperty("--primary");
  }
}

export async function fetchPublicSchoolBranding(slug: string): Promise<PublicSchoolBranding> {
  return api.get<PublicSchoolBranding>(`/public/schools/${encodeURIComponent(slug)}`);
}

export function usePublicSchoolBranding(slug: string | null) {
  const [branding, setBranding] = useState<PublicSchoolBranding | null>(null);
  const [loading, setLoading] = useState(Boolean(slug));
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!slug) {
      setBranding(null);
      setLoading(false);
      setMissing(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    fetchPublicSchoolBranding(slug)
      .then((data) => {
        if (cancelled) return;
        setBranding(data);
        applySchoolTheme(data.theme);
      })
      .catch(() => {
        if (cancelled) return;
        setBranding(null);
        setMissing(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { branding, loading, missing };
}
