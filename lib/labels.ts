"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/base-path";

import { useNamespace } from "@/lib/namespace";

// Client-side access to the BFF "nicer naming" label store (/ui2/api/labels).
// workspace = namespace, environment = mount, project = path. Labels are
// presentation-only; the underlying OpenBao paths are never renamed.

export type LabelScope = "workspace" | "environment" | "project";

export type Label = {
  namespace: string;
  scope: LabelScope;
  ref: string;
  label: string | null;
  description: string | null;
  color: string | null;
  env_group: string | null;
  updated_at: number;
};

export type LabelMap = Record<string, Label>; // key = `${scope}:${ref}`

export const labelKey = (scope: LabelScope, ref: string) => `${scope}:${ref}`;

/**
 * Labels for a namespace. Defaults to the current namespace; pass "" to read
 * the root-scoped workspace labels (namespaces are labeled globally there).
 */
export function useLabels(ns?: string) {
  const { namespace } = useNamespace();
  const target = ns ?? namespace;
  return useQuery({
    queryKey: ["ui-labels", target],
    queryFn: async (): Promise<LabelMap> => {
      const res = await fetch(
        `${API_BASE}/labels?namespace=${encodeURIComponent(target)}`,
        { headers: { "x-vault-namespace": target } },
      );
      if (!res.ok) return {};
      const data = (await res.json()) as { labels?: Label[] };
      const map: LabelMap = {};
      for (const l of data.labels ?? []) map[labelKey(l.scope, l.ref)] = l;
      return map;
    },
    staleTime: 30_000,
  });
}

export type SetLabelInput = {
  scope: LabelScope;
  ref: string;
  label?: string;
  description?: string;
  color?: string;
  env_group?: string;
};

export function useSetLabel(ns?: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const target = ns ?? namespace;
  return useMutation({
    meta: { success: "Saved" },
    mutationFn: async (input: SetLabelInput) => {
      const res = await fetch(`${API_BASE}/labels`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-vault-namespace": target,
        },
        body: JSON.stringify({ namespace: target, ...input }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          errors?: string[];
        };
        throw new Error(data.errors?.[0] ?? `Request failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ui-labels", target] }),
  });
}

/**
 * Remove a label entirely (e.g. when its underlying mount is disabled) so a
 * future recreate starts fresh. Reuses the PUT endpoint — sending no fields
 * deletes the row server-side. Silent (no success toast).
 */
export function useClearLabel(ns?: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const target = ns ?? namespace;
  return useMutation({
    meta: { silentError: true },
    mutationFn: async (input: { scope: LabelScope; ref: string }) => {
      const res = await fetch(`${API_BASE}/labels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-vault-namespace": target },
        body: JSON.stringify({ namespace: target, scope: input.scope, ref: input.ref }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { errors?: string[] };
        throw new Error(data.errors?.[0] ?? `Request failed (${res.status})`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ui-labels", target] }),
  });
}
