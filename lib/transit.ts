"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { baoFetch, BaoError } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";

const m = (s: string) => s.replace(/\/$/, "");

export type TransitKey = {
  name: string;
  type: string;
  latest_version: number;
  min_decryption_version: number;
  supports_encryption: boolean;
  supports_signing: boolean;
  keys: Record<string, unknown>;
};

export function useTransitKeys(mount: string) {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["transit-keys", namespace, m(mount)],
    queryFn: async () => {
      try {
        const res = await baoFetch<{ data: { keys: string[] } }>({
          path: `${m(mount)}/keys`,
          namespace,
          list: true,
        });
        return (res.data?.keys ?? []).sort();
      } catch (err) {
        if (err instanceof BaoError && err.status === 404) return [] as string[];
        throw err;
      }
    },
  });
}

export function useTransitKey(mount: string, name: string | null) {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["transit-key", namespace, m(mount), name],
    enabled: !!name,
    queryFn: async () => {
      const res = await baoFetch<{ data: TransitKey }>({
        path: `${m(mount)}/keys/${name}`,
        namespace,
      });
      return res.data;
    },
  });
}

export function useCreateTransitKey(mount: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Key created", silentError: true },
    mutationFn: async (vars: { name: string; type: string }) =>
      baoFetch({
        path: `${m(mount)}/keys/${vars.name}`,
        method: "POST",
        namespace,
        body: { type: vars.type },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transit-keys", namespace, m(mount)] }),
  });
}

export function useRotateTransitKey(mount: string, name: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Key rotated" },
    mutationFn: async () =>
      baoFetch({ path: `${m(mount)}/keys/${name}/rotate`, method: "POST", namespace, body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transit-key", namespace, m(mount), name] }),
  });
}

export function useEncrypt(mount: string, name: string) {
  const { namespace } = useNamespace();
  return useMutation({
    mutationFn: async (plaintextB64: string) => {
      const res = await baoFetch<{ data: { ciphertext: string } }>({
        path: `${m(mount)}/encrypt/${name}`,
        method: "POST",
        namespace,
        body: { plaintext: plaintextB64 },
      });
      return res.data.ciphertext;
    },
  });
}

export function useDecrypt(mount: string, name: string) {
  const { namespace } = useNamespace();
  return useMutation({
    mutationFn: async (ciphertext: string) => {
      const res = await baoFetch<{ data: { plaintext: string } }>({
        path: `${m(mount)}/decrypt/${name}`,
        method: "POST",
        namespace,
        body: { ciphertext },
      });
      return res.data.plaintext; // base64
    },
  });
}
