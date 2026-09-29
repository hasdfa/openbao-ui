"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { baoFetch, BaoError } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";

// --- current token (Profile) ---

export type TokenSelf = {
  accessor: string;
  display_name: string;
  policies: string[];
  entity_id: string;
  ttl: number;
  creation_time: number;
  expire_time: string | null;
  renewable: boolean;
  orphan: boolean;
  path: string;
  meta: Record<string, string> | null;
};

export function useTokenSelf() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["token-self", namespace],
    queryFn: async () => {
      const res = await baoFetch<{ data: TokenSelf }>({
        path: "auth/token/lookup-self",
        namespace,
      });
      return res.data;
    },
  });
}

// --- namespaces management ---

export type NamespaceInfo = { path: string; id: string };

export function useNamespacesDetailed() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["namespaces-detailed", namespace],
    queryFn: async (): Promise<NamespaceInfo[]> => {
      try {
        const res = await baoFetch<{
          data: { keys?: string[]; key_info?: Record<string, { id: string }> };
        }>({ path: "sys/namespaces", namespace, list: true });
        const info = res.data?.key_info ?? {};
        return (res.data?.keys ?? []).map((path) => ({
          path,
          id: info[path]?.id ?? "",
        }));
      } catch (err) {
        if (err instanceof BaoError && err.status === 404) return []; // 404 when none exist
        throw err;
      }
    },
  });
}

export function useCreateNamespace() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Namespace created", silentError: true },
    mutationFn: async (path: string) =>
      baoFetch({ path: `sys/namespaces/${path.replace(/\/+$/, "")}`, method: "POST", namespace, body: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["namespaces-detailed", namespace] });
      qc.invalidateQueries({ queryKey: ["namespaces", namespace] }); // the switcher
    },
  });
}

export function useDeleteNamespace() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Namespace deleted" },
    mutationFn: async (path: string) =>
      baoFetch({ path: `sys/namespaces/${path.replace(/\/+$/, "")}`, method: "DELETE", namespace }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["namespaces-detailed", namespace] });
      qc.invalidateQueries({ queryKey: ["namespaces", namespace] });
    },
  });
}

// --- server (sanitized config) ---

export function useSanitizedConfig() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["sanitized-config", namespace],
    queryFn: async () => {
      const res = await baoFetch<{ data: Record<string, unknown> }>({
        path: "sys/config/state/sanitized",
        namespace,
      });
      return res.data;
    },
  });
}

// --- CORS ---

export type CorsConfig = {
  enabled: boolean;
  allowed_origins: string[];
  allowed_headers: string[];
};

export function useCorsConfig() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["cors", namespace],
    queryFn: async (): Promise<CorsConfig> => {
      const res = await baoFetch<{ data: CorsConfig }>({ path: "sys/config/cors", namespace });
      return {
        enabled: !!res.data?.enabled,
        allowed_origins: res.data?.allowed_origins ?? [],
        allowed_headers: res.data?.allowed_headers ?? [],
      };
    },
  });
}

// --- dynamic loggers ---

export function useLoggers() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["loggers", namespace],
    queryFn: async (): Promise<Record<string, string>> => {
      try {
        const res = await baoFetch<{ data: Record<string, { log_level?: string } | string> }>(
          { path: "sys/loggers", namespace },
        );
        const out: Record<string, string> = {};
        for (const [name, v] of Object.entries(res.data ?? {})) {
          out[name] = typeof v === "string" ? v : v.log_level ?? "";
        }
        return out;
      } catch (err) {
        if (err instanceof BaoError && err.status === 404) return {};
        throw err;
      }
    },
  });
}

export function useSetLogLevel() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Log level updated", silentError: true },
    mutationFn: async (level: string) =>
      baoFetch({ path: "sys/loggers", method: "POST", namespace, body: { level } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loggers", namespace] }),
  });
}

export function useResetLoggers() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Log levels reset" },
    mutationFn: async () => baoFetch({ path: "sys/loggers", method: "DELETE", namespace }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["loggers", namespace] }),
  });
}

export function useSetCorsConfig() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "CORS updated", silentError: true },
    mutationFn: async (vars: { enabled: boolean; allowed_origins: string[]; allowed_headers: string[] }) => {
      if (!vars.enabled) {
        return baoFetch({ path: "sys/config/cors", method: "DELETE", namespace });
      }
      return baoFetch({
        path: "sys/config/cors",
        method: "POST",
        namespace,
        body: { allowed_origins: vars.allowed_origins, allowed_headers: vars.allowed_headers },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cors", namespace] }),
  });
}
