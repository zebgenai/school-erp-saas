import { useEffect, useState } from "react";
import { getAppHost, type AppHost } from "@/lib/host";

export type PendingAppHost = {
  mode: "pending";
  hostname: string;
  slug: null;
  ready: false;
};

export type ReadyAppHost = AppHost & { ready: true };

export type AppHostState = PendingAppHost | ReadyAppHost;

/** Resolves hostname only after mount so SSR/localhost hydration stays stable. */
export function useAppHost(): AppHostState {
  const [host, setHost] = useState<AppHost | null>(null);

  useEffect(() => {
    setHost(getAppHost());
  }, []);

  if (!host) {
    return { mode: "pending", hostname: "", slug: null, ready: false };
  }
  return { ...host, ready: true };
}
