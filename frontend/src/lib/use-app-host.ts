import { useEffect, useState } from "react";
import { getAppHost, type AppHost } from "@/lib/host";

/** Resolves hostname only after mount so SSR/localhost hydration stays stable. */
export function useAppHost(): AppHost & { ready: boolean } {
  const [host, setHost] = useState<AppHost | null>(null);

  useEffect(() => {
    setHost(getAppHost());
  }, []);

  if (!host) {
    return { mode: "local", hostname: "localhost", slug: null, ready: false };
  }
  return { ...host, ready: true };
}
