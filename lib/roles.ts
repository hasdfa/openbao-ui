"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/base-path";
import { readHttpEnvelope } from "@/lib/http/client";

import { baoFetch, BaoError } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";
import { type RoleTemplate } from "@/lib/role-defaults";

export type { RoleTemplate };

/** The role-template catalog for the current namespace (seeded with defaults). */
export function useRoleTemplates() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["role-templates", namespace],
    queryFn: async (): Promise<RoleTemplate[]> => {
      const response = await fetch(`${API_BASE}/role-templates`, {
        headers: { "x-vault-namespace": namespace },
      });
      const data = await readHttpEnvelope<{ templates: RoleTemplate[] }>(response);
      return data.templates;
    },
  });
}

export function useSaveRoleTemplates() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Roles saved" },
    mutationFn: async (templates: RoleTemplate[]) => {
      const response = await fetch(`${API_BASE}/role-templates`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-vault-namespace": namespace,
        },
        body: JSON.stringify({ templates }),
      });
      return readHttpEnvelope<{ templates: RoleTemplate[] }>(response);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role-templates", namespace] }),
  });
}

/**
 * Materialize a template into OpenBao: write the ACL policy, then create the
 * internal group that carries it. Both steps are idempotent (policy write
 * overwrites; group POST upserts by name), so re-applying is safe.
 */
export function useApplyRoleTemplate() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Role created", silentError: true },
    mutationFn: async (tpl: RoleTemplate) => {
      await baoFetch({
        path: `sys/policies/acl/${tpl.name}`,
        method: "POST",
        namespace,
        body: { policy: tpl.policy },
      });
      try {
        await baoFetch({
          path: "identity/group",
          method: "POST",
          namespace,
          body: { name: tpl.name, type: "internal", policies: [tpl.name] },
        });
      } catch (err) {
        // a group with this name may already exist — that's fine
        if (
          !(err instanceof BaoError && /already exists/i.test(err.errors.join(" ")))
        ) {
          throw err;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups", namespace] });
      qc.invalidateQueries({ queryKey: ["groups-detailed", namespace] });
      qc.invalidateQueries({ queryKey: ["policies", namespace] });
    },
  });
}
