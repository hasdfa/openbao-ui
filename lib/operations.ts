"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { baoFetch, BaoError } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";

// --- status (read-only) ---

export type Health = {
  initialized: boolean;
  sealed: boolean;
  standby: boolean;
  version: string;
  cluster_name?: string;
  server_time_utc?: number;
};

export function useHealth() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["health", namespace],
    // standbyok/perfstandbyok make /sys/health return 200 (not 429/473) for an
    // unsealed standby, so baoFetch doesn't throw and the page renders the real
    // mode + seal status for HA standby nodes.
    queryFn: () =>
      baoFetch<Health>({
        path: "sys/health",
        namespace,
        query: { standbyok: "true", perfstandbyok: "true" },
      }),
    refetchInterval: 15_000,
  });
}

export type Leader = {
  ha_enabled: boolean;
  is_self: boolean;
  leader_address: string;
  leader_cluster_address?: string;
};

export function useLeader() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["leader", namespace],
    queryFn: () => baoFetch<Leader>({ path: "sys/leader", namespace }),
  });
}

export type KeyStatus = {
  term: number;
  install_time: string;
  encryption_count?: number;
};

export function useKeyStatus() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["key-status", namespace],
    queryFn: async () => {
      const res = await baoFetch<{ data: KeyStatus }>({ path: "sys/key-status", namespace });
      return res.data;
    },
  });
}

export function useRaftConfig() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["raft-config", namespace],
    queryFn: async (): Promise<{ servers: { node_id: string; address: string; leader: boolean }[] } | null> => {
      try {
        const res = await baoFetch<{ data: { config: { servers: { node_id: string; address: string; leader: boolean }[] } } }>({
          path: "sys/storage/raft/configuration",
          namespace,
        });
        return res.data?.config ?? null;
      } catch (err) {
        if (
          err instanceof BaoError &&
          (err.status === 404 || /not using raft/i.test(err.errors.join(" ")))
        ) {
          return null; // not using raft storage
        }
        throw err;
      }
    },
  });
}

export function useRotateKey() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Encryption key rotated" },
    mutationFn: async () => baoFetch({ path: "sys/rotate", method: "POST", namespace, body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["key-status", namespace] }),
  });
}

export function useSeal() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "OpenBao sealed" },
    mutationFn: async () => baoFetch({ path: "sys/seal", method: "POST", namespace, body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["health", namespace] }),
  });
}

// --- audit devices ---

export type AuditDevice = {
  path: string;
  type: string;
  description?: string;
  options?: Record<string, string>;
};

export function useAuditDevices() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["audit", namespace],
    queryFn: async (): Promise<AuditDevice[]> => {
      const res = await baoFetch<{ data: Record<string, { type: string; description?: string; options?: Record<string, string> }> }>(
        { path: "sys/audit", namespace },
      );
      return Object.entries(res.data ?? {})
        .filter(([, v]) => v && typeof v === "object" && "type" in v)
        .map(([path, v]) => ({ path, type: v.type, description: v.description, options: v.options }));
    },
  });
}

export function useEnableAudit() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Audit device enabled", silentError: true },
    mutationFn: async (vars: { path: string; type: string; options?: Record<string, string> }) =>
      baoFetch({
        path: `sys/audit/${vars.path.replace(/\/$/, "")}`,
        method: "POST",
        namespace,
        body: { type: vars.type, options: vars.options },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit", namespace] }),
  });
}

export function useDisableAudit() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Audit device disabled" },
    mutationFn: async (path: string) =>
      baoFetch({ path: `sys/audit/${path.replace(/\/$/, "")}`, method: "DELETE", namespace }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit", namespace] }),
  });
}

// --- rate-limit quotas ---

export function useRateLimitQuotas() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["quotas", namespace],
    queryFn: async () => {
      try {
        const res = await baoFetch<{ data: { keys: string[] } }>({
          path: "sys/quotas/rate-limit",
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

export function useCreateRateLimitQuota() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Quota saved", silentError: true },
    mutationFn: async (vars: { name: string; rate: number; interval?: string; path?: string }) =>
      baoFetch({
        path: `sys/quotas/rate-limit/${vars.name}`,
        method: "POST",
        namespace,
        body: { rate: vars.rate, interval: vars.interval || undefined, path: vars.path || undefined },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotas", namespace] }),
  });
}

export function useDeleteRateLimitQuota() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Quota deleted" },
    mutationFn: async (name: string) =>
      baoFetch({ path: `sys/quotas/rate-limit/${name}`, method: "DELETE", namespace }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotas", namespace] }),
  });
}

// --- plugin catalog (read-only) ---

export type PluginCatalog = { auth: string[]; database: string[]; secret: string[] };

export function usePlugins() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["plugins", namespace],
    queryFn: async (): Promise<PluginCatalog> => {
      const res = await baoFetch<{ data: Partial<PluginCatalog> }>({ path: "sys/plugins/catalog", namespace });
      return {
        auth: res.data?.auth ?? [],
        database: res.data?.database ?? [],
        secret: res.data?.secret ?? [],
      };
    },
  });
}
