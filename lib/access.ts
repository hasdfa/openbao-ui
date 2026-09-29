"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { baoFetch, BaoError } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";

// ---------------------------------------------------------------------------
// Policies (ACL)
// ---------------------------------------------------------------------------

export function usePolicies() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["policies", namespace],
    queryFn: async () => {
      const res = await baoFetch<{ data: { keys: string[] } }>({
        path: "sys/policies/acl",
        namespace,
        list: true,
      });
      return (res.data?.keys ?? []).sort();
    },
  });
}

export function usePolicy(name: string | null) {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["policy", namespace, name],
    enabled: !!name,
    queryFn: async () => {
      const res = await baoFetch<{ data: { name: string; policy: string } }>({
        path: `sys/policies/acl/${name}`,
        namespace,
      });
      return res.data;
    },
  });
}

export function useWritePolicy() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Policy saved", silentError: true },
    mutationFn: async (vars: { name: string; policy: string }) =>
      baoFetch({
        path: `sys/policies/acl/${vars.name}`,
        method: "POST",
        namespace,
        body: { policy: vars.policy },
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["policies", namespace] });
      qc.invalidateQueries({ queryKey: ["policy", namespace, vars.name] });
    },
  });
}

export function useDeletePolicy() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Policy deleted" },
    mutationFn: async (name: string) =>
      baoFetch({
        path: `sys/policies/acl/${name}`,
        method: "DELETE",
        namespace,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["policies", namespace] }),
  });
}

// ---------------------------------------------------------------------------
// Capabilities tester
// ---------------------------------------------------------------------------

export function useCapabilities() {
  const { namespace } = useNamespace();
  return useMutation({
    meta: { silentError: true },
    mutationFn: async (paths: string[]) => {
      const res = await baoFetch<{ data: Record<string, unknown> }>({
        path: "sys/capabilities-self",
        method: "POST",
        namespace,
        body: { paths },
      });
      // data has a key per path plus a flat "capabilities" for single-path calls
      const out: Record<string, string[]> = {};
      for (const p of paths) {
        const v = res.data[p];
        if (Array.isArray(v)) out[p] = v as string[];
      }
      return out;
    },
  });
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export type TokenInfo = {
  accessor: string;
  display_name: string;
  policies: string[];
  ttl: number;
  creation_time?: number;
  expire_time: string | null;
  path?: string;
};

/** Accessors looked up per page load; `total` says how many exist, so a cap is never silent. */
export const TOKEN_LOOKUP_LIMIT = 200;

/** List token accessors and look each up (capped) so we can show a table. */
export function useTokens() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["tokens", namespace],
    queryFn: async () => {
      const list = await baoFetch<{ data: { keys: string[] } }>({
        path: "auth/token/accessors",
        namespace,
        list: true,
      });
      const all = list.data?.keys ?? [];
      const accessors = all.slice(0, TOKEN_LOOKUP_LIMIT);
      const infos = await Promise.all(
        accessors.map(async (accessor) => {
          try {
            const r = await baoFetch<{ data: TokenInfo }>({
              path: "auth/token/lookup-accessor",
              method: "POST",
              namespace,
              body: { accessor },
            });
            return r.data;
          } catch (err) {
            if (err instanceof BaoError && err.status === 404) return null;
            throw err;
          }
        }),
      );
      return { items: infos.filter((x): x is TokenInfo => !!x), total: all.length };
    },
  });
}

export function useTokenRoles() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["token-roles", namespace],
    queryFn: async () => {
      try {
        const res = await baoFetch<{ data: { keys: string[] } }>({
          path: "auth/token/roles",
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

export type CreateTokenVars = {
  policies?: string[];
  display_name?: string;
  ttl?: string;
  no_parent?: boolean;
  renewable?: boolean;
  num_uses?: number;
  role?: string;
};

export function useCreateToken() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Token created", silentError: true },
    mutationFn: async (vars: CreateTokenVars) => {
      const { role, ...body } = vars;
      const res = await baoFetch<{
        auth: { client_token: string; accessor: string; policies: string[] };
      }>({
        path: role ? `auth/token/create/${role}` : "auth/token/create",
        method: "POST",
        namespace,
        body,
      });
      return res.auth;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokens", namespace] }),
  });
}

export function useRevokeAccessor() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Token revoked" },
    mutationFn: async (accessor: string) =>
      baoFetch({
        path: "auth/token/revoke-accessor",
        method: "POST",
        namespace,
        body: { accessor },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tokens", namespace] }),
  });
}

// ---------------------------------------------------------------------------
// Leases
// ---------------------------------------------------------------------------

export function useLeaseList(prefix: string) {
  const { namespace } = useNamespace();
  const p = prefix.replace(/^\/+|\/+$/g, "");
  return useQuery({
    queryKey: ["leases", namespace, p],
    queryFn: async () => {
      try {
        const res = await baoFetch<{ data: { keys: string[] } }>({
          path: `sys/leases/lookup/${p}`,
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

export type LeaseDetail = {
  id: string;
  issue_time: string;
  expire_time: string;
  last_renewal: string | null;
  renewable: boolean;
  ttl: number;
};

export function useLeaseLookup() {
  const { namespace } = useNamespace();
  return useMutation({
    mutationFn: async (lease_id: string) => {
      const res = await baoFetch<{ data: LeaseDetail }>({
        path: "sys/leases/lookup",
        method: "POST",
        namespace,
        body: { lease_id },
      });
      return res.data;
    },
  });
}

export function useRenewLease() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Lease renewed" },
    mutationFn: async (vars: { lease_id: string; increment?: number }) =>
      baoFetch({
        path: "sys/leases/renew",
        method: "POST",
        namespace,
        body: vars,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leases", namespace] }),
  });
}

export function useRevokeLease() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Lease revoked" },
    mutationFn: async (vars: { lease_id: string; prefix?: boolean }) =>
      baoFetch({
        path: vars.prefix
          ? `sys/leases/revoke-prefix/${vars.lease_id.replace(/^\/+/, "")}`
          : "sys/leases/revoke",
        method: "POST",
        namespace,
        body: vars.prefix ? undefined : { lease_id: vars.lease_id },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leases", namespace] }),
  });
}
