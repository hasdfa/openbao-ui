"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { baoFetch, BaoError } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";

// Cubbyhole is a KV-v1-style, per-token private store at cubbyhole/<path>.
// No versioning, no /data|/metadata split — the body is the raw key/value map.
const strip = (s: string) => s.replace(/^\/+|\/+$/g, "");

export function useCubbyholeList(folder: string) {
  const { namespace } = useNamespace();
  const p = strip(folder);
  return useQuery({
    queryKey: ["cubbyhole-list", namespace, p],
    queryFn: async () => {
      try {
        const res = await baoFetch<{ data: { keys: string[] } }>({
          path: `cubbyhole/${p}`,
          namespace,
          list: true,
        });
        return res.data?.keys ?? [];
      } catch (err) {
        if (err instanceof BaoError && err.status === 404) return [] as string[];
        throw err;
      }
    },
  });
}

export function useCubbyholeSecret(path: string | null) {
  const { namespace } = useNamespace();
  const p = path ? strip(path) : "";
  return useQuery({
    queryKey: ["cubbyhole-secret", namespace, p],
    enabled: !!p,
    queryFn: async () => {
      const res = await baoFetch<{ data: Record<string, unknown> }>({
        path: `cubbyhole/${p}`,
        namespace,
      });
      return res.data ?? {};
    },
  });
}

export function useCubbyholeWrite() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Secret saved", silentError: true },
    mutationFn: async (vars: { path: string; data: Record<string, unknown> }) =>
      baoFetch({
        path: `cubbyhole/${strip(vars.path)}`,
        method: "POST",
        namespace,
        body: vars.data,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cubbyhole-list", namespace] });
      qc.invalidateQueries({ queryKey: ["cubbyhole-secret", namespace] });
    },
  });
}

export function useCubbyholeDelete() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Secret deleted" },
    mutationFn: async (path: string) =>
      baoFetch({ path: `cubbyhole/${strip(path)}`, method: "DELETE", namespace }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cubbyhole-list", namespace] });
      qc.invalidateQueries({ queryKey: ["cubbyhole-secret", namespace] });
    },
  });
}
