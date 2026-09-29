"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { baoFetch, BaoError } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";

const m = (s: string) => s.replace(/\/$/, "");

export function useSshCa(mount: string) {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["ssh-ca", namespace, m(mount)],
    queryFn: async (): Promise<string | null> => {
      try {
        const res = await baoFetch<{ data: { public_key: string } }>({
          path: `${m(mount)}/config/ca`,
          namespace,
        });
        return res.data?.public_key ?? null;
      } catch (err) {
        if (err instanceof BaoError && err.status === 404) return null; // signing key not configured yet
        throw err;
      }
    },
  });
}

export function useConfigureSshCa(mount: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Signing key generated", silentError: true },
    mutationFn: async () =>
      baoFetch({
        path: `${m(mount)}/config/ca`,
        method: "POST",
        namespace,
        body: { generate_signing_key: true },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ssh-ca", namespace, m(mount)] }),
  });
}

export function useSshRoles(mount: string) {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["ssh-roles", namespace, m(mount)],
    queryFn: async () => {
      try {
        const res = await baoFetch<{ data: { keys: string[] } }>({
          path: `${m(mount)}/roles`,
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

export function useCreateSshRole(mount: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Role saved", silentError: true },
    mutationFn: async (vars: {
      name: string;
      allowed_users?: string;
      default_user?: string;
      ttl?: string;
    }) =>
      baoFetch({
        path: `${m(mount)}/roles/${vars.name}`,
        method: "POST",
        namespace,
        body: {
          key_type: "ca",
          allow_user_certificates: true,
          allowed_users: vars.allowed_users || "",
          default_user: vars.default_user || "",
          ttl: vars.ttl || undefined,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ssh-roles", namespace, m(mount)] }),
  });
}

export function useDeleteSshRole(mount: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Role deleted" },
    mutationFn: async (name: string) =>
      baoFetch({ path: `${m(mount)}/roles/${name}`, method: "DELETE", namespace }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ssh-roles", namespace, m(mount)] }),
  });
}

export function useSshSign(mount: string) {
  const { namespace } = useNamespace();
  return useMutation({
    mutationFn: async (vars: { role: string; public_key: string }) => {
      const res = await baoFetch<{ data: { signed_key: string } }>({
        path: `${m(mount)}/sign/${vars.role}`,
        method: "POST",
        namespace,
        body: { public_key: vars.public_key },
      });
      return res.data.signed_key;
    },
  });
}
