"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/base-path";

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
export type EnvSelector =
  | { kind: "mounts"; mounts: string[] } // explicit KV mounts (no trailing slash)
  | { kind: "folders"; mount: string; folders: string[] }; // single-mount: env folders

export type AccessRole = {
  name: string; // also the policy + identity group name
  description?: string;
  level: AccessLevel;
  env: EnvSelector;
  paths: string[]; // env-relative secret paths this role may access
};

const stripSlash = (s: string) => s.replace(/^\/+|\/+$/g, "");

/** Resolve an env selector to concrete environment targets for the generator. */
export function resolveEnvs(env: EnvSelector): EnvTarget[] {
  if (env.kind === "mounts") {
    return env.mounts.map((m) => ({ mount: stripSlash(m) }));
  }
  return env.folders.map((f) => ({ mount: stripSlash(env.mount), envPath: stripSlash(f) }));
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

// Throws rather than returning [] on failure: the store is saved as a whole
// list, so an empty stand-in for "couldn't load" would be written back and wipe it.
async function fetchAccessRoles(namespace: string): Promise<AccessRole[]> {
  const res = await fetch(`${API_BASE}/access-roles`, {
    headers: { "x-vault-namespace": namespace },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { errors?: string[] };
    throw new Error(data.errors?.[0] ?? `Could not load access roles (${res.status})`);
  }
  const data = (await res.json()) as { roles?: AccessRole[] };
  return data.roles ?? [];
}

export function useAccessRoles() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["access-roles", namespace],
    queryFn: () => fetchAccessRoles(namespace),
  });
}

function useSaveAccessRoles() {
  const { namespace } = useNamespace();
  return async (roles: AccessRole[]) => {
    const res = await fetch(`${API_BASE}/access-roles`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-vault-namespace": namespace },
      body: JSON.stringify({ roles }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { errors?: string[] };
      throw new Error(data.errors?.[0] ?? `Request failed (${res.status})`);
    }
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
    mutationFn: async (vars: { role: AccessRole }) => {
      const { role } = vars;
      const envs = resolveEnvs(role.env);
      if (envs.length === 0) throw new Error("No environments matched this selection");
      const policy = buildAccessPolicy({ envs, level: role.level, paths: role.paths });

      // Only overwrite a policy this UI manages. A grant named `default`,
      // `admin` or after any hand-written policy would silently replace it.
      if (["default", "root"].includes(role.name)) {
        throw new Error(`"${role.name}" is a built-in policy name; pick another`);
      }
      const existing = await fetchAccessRoles(namespace);
      if (!existing.some((r) => r.name === role.name)) {
        const taken = await baoFetch({ path: `sys/policies/acl/${role.name}`, namespace }).then(
          () => true,
          (err) => {
            if (err instanceof BaoError && err.status === 404) return false;
            throw err;
          },
        );
        if (taken) {
          throw new Error(`A policy named "${role.name}" already exists; pick another name`);
        }
      }

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
        if (!(err instanceof BaoError && /already exists/i.test(err.errors.join(" ")))) {
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
    mutationFn: async (vars: { name: string }) => {
      const existing = await fetchAccessRoles(namespace);
      await save(existing.filter((r) => r.name !== vars.name));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["access-roles", namespace] }),
  });
}
