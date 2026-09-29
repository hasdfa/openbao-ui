"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { baoFetch, BaoError } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";

export type MfaMethod = { id: string; type: string; issuer?: string };

// --- TOTP methods (identity/mfa/method/totp) ---

export function useTotpMethods() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["mfa-totp", namespace],
    queryFn: async (): Promise<MfaMethod[]> => {
      try {
        const res = await baoFetch<{
          data: { keys?: string[]; key_info?: Record<string, { issuer?: string }> };
        }>({ path: "identity/mfa/method/totp", namespace, list: true });
        const keys = res.data?.keys ?? [];
        const info = res.data?.key_info ?? {};
        return keys.map((id) => ({ id, type: "totp", issuer: info[id]?.issuer }));
      } catch (err) {
        if (err instanceof BaoError && err.status === 404) return [];
        throw err;
      }
    },
  });
}

export function useCreateTotpMethod() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "TOTP method created", silentError: true },
    mutationFn: async (vars: {
      issuer: string;
      period?: number;
      digits?: number;
      algorithm?: string;
    }) => {
      const res = await baoFetch<{ data: { method_id: string } }>({
        path: "identity/mfa/method/totp",
        method: "POST",
        namespace,
        body: vars,
      });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mfa-totp", namespace] }),
  });
}

export function useDeleteTotpMethod() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Method deleted" },
    mutationFn: async (id: string) =>
      baoFetch({ path: `identity/mfa/method/totp/${id}`, method: "DELETE", namespace }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mfa-totp", namespace] }),
  });
}

// --- login enforcements (identity/mfa/login-enforcement) ---

export function useLoginEnforcements() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["mfa-enforcements", namespace],
    queryFn: async (): Promise<string[]> => {
      try {
        const res = await baoFetch<{ data: { keys: string[] } }>({
          path: "identity/mfa/login-enforcement",
          namespace,
          list: true,
        });
        return res.data?.keys ?? [];
      } catch (err) {
        if (err instanceof BaoError && err.status === 404) return [];
        throw err;
      }
    },
  });
}

export function useCreateLoginEnforcement() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Enforcement created", silentError: true },
    mutationFn: async (vars: {
      name: string;
      mfa_method_ids: string[];
      auth_method_accessors?: string[];
    }) =>
      baoFetch({
        path: `identity/mfa/login-enforcement/${vars.name}`,
        method: "POST",
        namespace,
        body: {
          mfa_method_ids: vars.mfa_method_ids,
          auth_method_accessors: vars.auth_method_accessors ?? [],
        },
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["mfa-enforcements", namespace] }),
  });
}

export function useDeleteLoginEnforcement() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Enforcement deleted" },
    mutationFn: async (name: string) =>
      baoFetch({
        path: `identity/mfa/login-enforcement/${name}`,
        method: "DELETE",
        namespace,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["mfa-enforcements", namespace] }),
  });
}
