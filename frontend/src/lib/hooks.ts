import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "./api";
import { formatApiError } from "./errors";

function stableKey(params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return "";
  const sorted = Object.keys(params)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = params[k];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

export type ApiQueryOptions = {
  staleTime?: number;
  gcTime?: number;
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
};

export function useApiQuery<T = unknown>(
  path: string | null,
  params?: Record<string, unknown>,
  options?: ApiQueryOptions,
) {
  const queryClient = useQueryClient();
  const queryKey = path ? (["api", path, stableKey(params)] as const) : (["api", null] as const);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!path) return null as T;
      return api.get<T>(path, params);
    },
    enabled: Boolean(path) && options?.enabled !== false,
    staleTime: options?.staleTime ?? 60_000,
    gcTime: options?.gcTime ?? 5 * 60_000,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    refetchInterval: options?.refetchInterval,
    retry: 1,
  });

  const refetch = useCallback(async () => {
    const result = await query.refetch();
    return result;
  }, [query]);

  const setData = useCallback(
    (value: T | ((prev: T | null) => T)) => {
      queryClient.setQueryData<T | null>(queryKey, (prev) => {
        if (typeof value === "function") {
          return (value as (prev: T | null) => T)(prev ?? null);
        }
        return value;
      });
    },
    [queryClient, queryKey],
  );

  return {
    data: (query.data ?? null) as T | null,
    loading: query.isLoading || (query.isFetching && !query.isFetched),
    error: query.error ? formatApiError(query.error) : null,
    refetch,
    setData,
    isFetching: query.isFetching,
  };
}

// Normalize list responses: arrays or { data: [...] } or { items: [...] }
export function asList<T = unknown>(d: unknown): T[] {
  if (!d) return [];
  if (Array.isArray(d)) return d as T[];
  if (typeof d === "object" && d !== null) {
    const obj = d as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as T[];
    if (Array.isArray(obj.items)) return obj.items as T[];
    if (Array.isArray(obj.results)) return obj.results as T[];
  }
  return [];
}

export function asObj<T = Record<string, unknown>>(d: unknown): T {
  if (!d) return {} as T;
  if (typeof d === "object" && d !== null) {
    const obj = d as Record<string, unknown>;
    if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
      return obj.data as T;
    }
  }
  return d as T;
}
