"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/base-path";
import { readHttpEnvelope } from "@/lib/http/client";

import {
  buildAccessPolicy,
  type AccessLevel,
  type AccessScope,
  type EnvTarget,
} from "@/lib/access-policy";
import { baoFetch, BaoError } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";

// How a scoped role selects its environments — explicit multi-select of mounts,
// or env folders within a single mount.
import { type AccessRole, type EnvSelector } from "@/lib/access-role-schema";

export { type AccessRole, type EnvSelector } from "@/lib/access-role-schema";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

export function isEnvSelector(value: unknown): value is EnvSelector {
  if (!isRecord(value)) return false;
  if (value.kind === "mounts") return isStringArray(value.mounts);
  return (
    value.kind === "folders" &&
    typeof value.mount === "string" &&
    isStringArray(value.folders)
  );
}

export function isAccessRole(value: unknown): value is AccessRole {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === "string" &&
    (value.description === undefined ||
      typeof value.description === "string") &&
    (value.level === "viewer" ||
      value.level === "editor" ||
      value.level === "admin") &&
    isEnvSelector(value.env) &&
    isStringArray(value.paths)
  );
}

const stripSlash = (value: string) => value.replace(/^\/+|\/+$/g, "");

/** Resolve an env selector to concrete environment targets for the generator. */
export function resolveEnvs(env: EnvSelector): EnvTarget[] {
  if (env.kind === "mounts") {
    return env.mounts.map((m) => ({ mount: stripSlash(m) }));
  }
  return env.folders.map((f) => ({
    mount: stripSlash(env.mount),
    envPath: stripSlash(f),
  }));
}

/** Preview the policy a role would generate (pure; for the builder + display). */
export function previewPolicy(role: AccessRole): string {
  const scope: AccessScope = {
    envs: resolveEnvs(role.env),
    level: role.level,
    paths: role.paths,
  };
  return buildAccessPolicy(scope);
}

// --- store (definitions live in the BFF so they're editable / re-syncable) ---

export function useAccessRoles() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["access-roles", namespace],
    queryFn: async (): Promise<AccessRole[]> => {
      const response = await fetch(`${API_BASE}/access-roles`, {
        headers: { "x-vault-namespace": namespace },
      });
      const data = await readHttpEnvelope<{ roles: AccessRole[] }>(response);
      return data.roles;
    },
  });
}

function useSaveAccessRoles() {
  const { namespace } = useNamespace();
  return async (roles: AccessRole[]) => {
    const response = await fetch(`${API_BASE}/access-roles`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-vault-namespace": namespace,
      },
      body: JSON.stringify({ roles }),
    });
    await readHttpEnvelope<{ roles: AccessRole[] }>(response);
  };
}

/**
 * Materialize a scoped role into OpenBao (write the generated policy + upsert
 * the identity group that carries it) AND save/replace its definition in the
 * store. Re-running for an existing name is how "Sync grants" re-resolves the
 * env group after membership changes. Idempotent.
 */
export function useApplyAccessRole() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const save = useSaveAccessRoles();
  return useMutation({
    meta: { success: "Access role applied", silentError: true },
    mutationFn: async (vars: { role: AccessRole; existing: AccessRole[] }) => {
      const { role, existing } = vars;
      const envs = resolveEnvs(role.env);
      if (envs.length === 0)
        throw new Error("No environments matched this selection");
      const policy = buildAccessPolicy({
        envs,
        level: role.level,
        paths: role.paths,
      });

      await baoFetch({
        path: `sys/policies/acl/${role.name}`,
        method: "POST",
        namespace,
        body: { policy },
      });
      try {
        await baoFetch({
          path: "identity/group",
          method: "POST",
          namespace,
          body: { name: role.name, type: "internal", policies: [role.name] },
        });
      } catch (err) {
        if (
          !(
            err instanceof BaoError &&
            /already exists/i.test(err.errors.join(" "))
          )
        ) {
          throw err;
        }
      }

      const next = [...existing.filter((r) => r.name !== role.name), role];
      await save(next);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["access-roles", namespace] });
      qc.invalidateQueries({ queryKey: ["groups", namespace] });
      qc.invalidateQueries({ queryKey: ["groups-detailed", namespace] });
      qc.invalidateQueries({ queryKey: ["policies", namespace] });
    },
  });
}

/** Remove a scoped role's definition from the store (its policy/group remain,
 *  manageable under Access — we don't delete a group members may still hold). */
export function useDeleteAccessRole() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const save = useSaveAccessRoles();
  return useMutation({
    meta: { success: "Access role removed" },
    mutationFn: async (vars: { name: string; existing: AccessRole[] }) => {
      await save(vars.existing.filter((r) => r.name !== vars.name));
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["access-roles", namespace] }),
  });
}
