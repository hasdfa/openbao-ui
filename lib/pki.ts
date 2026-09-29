"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { baoFetch, BaoError } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";

const m = (s: string) => s.replace(/\/$/, "");

export function usePkiIssuers(mount: string) {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["pki-issuers", namespace, m(mount)],
    queryFn: async () => {
      try {
        const res = await baoFetch<{ data: { keys: string[] } }>({
          path: `${m(mount)}/issuers`,
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

export function useGenerateRoot(mount: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Root CA generated", silentError: true },
    mutationFn: async (vars: { common_name: string; ttl?: string }) => {
      const res = await baoFetch<{ data: { certificate: string; issuer_id: string } }>({
        path: `${m(mount)}/root/generate/internal`,
        method: "POST",
        namespace,
        body: { common_name: vars.common_name, ttl: vars.ttl || undefined },
      });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pki-issuers", namespace, m(mount)] }),
  });
}

export function usePkiRoles(mount: string) {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["pki-roles", namespace, m(mount)],
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

export function useCreatePkiRole(mount: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Role saved", silentError: true },
    mutationFn: async (vars: {
      name: string;
      allowed_domains?: string[];
      allow_subdomains?: boolean;
      allow_any_name?: boolean;
      max_ttl?: string;
    }) =>
      baoFetch({
        path: `${m(mount)}/roles/${vars.name}`,
        method: "POST",
        namespace,
        body: {
          allowed_domains: vars.allowed_domains ?? [],
          allow_subdomains: vars.allow_subdomains ?? false,
          allow_any_name: vars.allow_any_name ?? false,
          max_ttl: vars.max_ttl || undefined,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pki-roles", namespace, m(mount)] }),
  });
}

export function useDeletePkiRole(mount: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Role deleted" },
    mutationFn: async (name: string) =>
      baoFetch({ path: `${m(mount)}/roles/${name}`, method: "DELETE", namespace }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pki-roles", namespace, m(mount)] }),
  });
}

export type IssuedCert = {
  certificate: string;
  private_key: string;
  serial_number: string;
  issuing_ca: string;
};

export function useIssueCert(mount: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Certificate issued", silentError: true },
    mutationFn: async (vars: { role: string; common_name: string; ttl?: string }) => {
      const res = await baoFetch<{ data: IssuedCert }>({
        path: `${m(mount)}/issue/${vars.role}`,
        method: "POST",
        namespace,
        body: { common_name: vars.common_name, ttl: vars.ttl || undefined },
      });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pki-certs", namespace, m(mount)] }),
  });
}

export function usePkiCerts(mount: string) {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["pki-certs", namespace, m(mount)],
    queryFn: async () => {
      try {
        const res = await baoFetch<{ data: { keys: string[] } }>({
          path: `${m(mount)}/certs`,
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

export function useRevokePkiCert(mount: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Certificate revoked", silentError: true },
    mutationFn: async (serial_number: string) => baoFetch({
      path: `${m(mount)}/revoke`, method: "POST", namespace, body: { serial_number },
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pki-certs", namespace, m(mount)] }),
  });
}
