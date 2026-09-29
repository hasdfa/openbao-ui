"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/base-path";

import { buildAccessPolicy, type AccessLevel, type EnvTarget } from "@/lib/access-policy";
import { resolveEnvs, type EnvSelector } from "@/lib/access-roles";
import { baoFetch, BaoError } from "@/lib/bao-client";
import { safeAuthMount, safeBaoName } from "@/lib/oidc-domains";
import { useNamespace } from "@/lib/namespace";

// A machine identity for a project: one AppRole per environment (isolated), each
// bound to a scoped policy. The store keeps only this non-secret definition.
export type ProjectCredential = {
  project: string; // client name (also the role/policy prefix), e.g. "backend"
  level: AccessLevel; // viewer = read-only, editor = read/write
  env: EnvSelector;
  mount: string; // approle auth mount (default "approle")
  ttl?: string; // token_ttl, e.g. "1h"
  paths: string[]; // env-relative secret paths this client may access
  roles: { env: string; role: string; policy: string }[]; // materialized per env
  createdAt: number;
};

// Per-environment credentials returned for one-time reveal (never persisted).
export type IssuedCred = {
  env: string;
  role: string;
  roleId: string;
  secretId: string;
  policy: string;
  mount: string;
};

const stripSlash = (s: string) => s.replace(/^\/+|\/+$/g, "");
const slug = (s: string) =>
  stripSlash(s)
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

/** Unique names per issuance; display slugs are never used as identity keys. */
export function credNames(project: string, env: string, level: AccessLevel) {
  const a = slug(project);
  const e = slug(env);
  const suffix = level === "viewer" ? "read" : level;
  const id = crypto.randomUUID();
  const name = `${a.slice(0, 40)}-${e.slice(0, 40)}-${id}`;
  return { role: name, policy: `${name}-${suffix}` };
}

/** A stable per-environment identity for naming (folders layout disambiguated). */
export const envIdent = (e: EnvTarget) => (e.envPath ? `${e.mount}-${e.envPath}` : e.mount);

/** Delete-dialog warning: deleting a project also revokes what it issued. */
export function credWarning(creds: ProjectCredential[] | undefined, project: string | undefined) {
  const n = (creds ?? []).filter((c) => c.project === project).length;
  if (!n) return undefined;
  return `Also revokes ${n} issued credential${n === 1 ? "" : "s"} for this project. Services using ${
    n === 1 ? "it" : "them"
  } stop authenticating immediately.`;
}

// --- store ---

// Throws rather than returning [] on failure: the store is saved as a whole
// list, so an empty stand-in for "couldn't load" would be written back and wipe it.
async function fetchProjectCredentials(namespace: string): Promise<ProjectCredential[]> {
  const res = await fetch(`${API_BASE}/project-credentials`, {
    headers: { "x-vault-namespace": namespace },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { errors?: string[] };
    throw new Error(data.errors?.[0] ?? `Could not load project credentials (${res.status})`);
  }
  const data = (await res.json()) as { creds?: ProjectCredential[] };
  return data.creds ?? [];
}

export function useProjectCredentials() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["project-credentials", namespace],
    queryFn: () => fetchProjectCredentials(namespace),
  });
}

function useSaveProjectCredentials() {
  const { namespace } = useNamespace();
  return async (creds: ProjectCredential[]) => {
    const res = await fetch(`${API_BASE}/project-credentials`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-vault-namespace": namespace },
      body: JSON.stringify({ creds }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { errors?: string[] };
      throw new Error(data.errors?.[0] ?? `Request failed (${res.status})`);
    }
  };
}

const sameCred = (a: ProjectCredential, project: string, env: EnvSelector) =>
  a.project === project && JSON.stringify(a.env) === JSON.stringify(env);

async function ensureApprole(mount: string, namespace: string) {
  try {
    await baoFetch({
      path: `sys/auth/${stripSlash(mount)}`,
      method: "POST",
      namespace,
      body: { type: "approle" },
    });
  } catch (err) {
    if (!(err instanceof BaoError && /already in use|path is already/i.test(err.errors.join(" ")))) {
      throw err;
    }
  }
}

export async function assertCredentialNamesAvailable(
  names: { role: string; policy: string }, mount: string, namespace: string,
): Promise<void> {
  for (const path of [`auth/${mount}/role/${names.role}`, `sys/policies/acl/${names.policy}`]) {
    try {
      await baoFetch({ path, namespace });
    } catch (err) {
      if (err instanceof BaoError && err.status === 404) continue;
      throw err;
    }
    throw new Error("Credential resource already exists; refusing to overwrite it. Retry issuance with fresh names.");
  }
}

/**
 * Issue a project credential: for EACH resolved environment, write a scoped
 * policy, create an AppRole bound to it, and fetch role_id + a fresh secret_id.
 * Per-env isolation: a leak in one env can't read another. Returns the secrets
 * once and persists only the definition.
 */
export function useIssueProjectCredential() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const save = useSaveProjectCredentials();
  return useMutation({
    meta: { success: "Project credential issued", silentError: true },
    mutationFn: async (vars: {
      project: string;
      env: EnvSelector;
      level: AccessLevel;
      mount?: string;
      ttl?: string;
      paths?: string[];
    }): Promise<{ definition: ProjectCredential; issued: IssuedCred[] }> => {
      const project = safeBaoName(vars.project);
      if (!project) throw new Error("Project name contains unsupported characters");
      // Read the store fresh: a stale or failed cache would be written back whole.
      const existing = await fetchProjectCredentials(namespace);
      if (existing.some((c) => sameCred(c, project, vars.env))) {
        throw new Error("This credential already exists. Rotate it, or revoke it before issuing a replacement.");
      }
      const mount = safeAuthMount(vars.mount || "approle");
      if (!mount) throw new Error("Invalid AppRole mount");
      const envs = resolveEnvs(vars.env);
      if (envs.length === 0) throw new Error("No environments matched this selection");

      // Validate all scopes before creating any OpenBao resources.
      const planned = envs.map((e) => ({
        ident: envIdent(e),
        ...credNames(project, envIdent(e), vars.level),
        policyHcl: buildAccessPolicy({ envs: [e], level: vars.level, paths: vars.paths }),
      }));
      await ensureApprole(mount, namespace);
      for (const names of planned) await assertCredentialNamesAvailable(names, mount, namespace);
      await save(existing);

      const issued: IssuedCred[] = [];
      const roles: ProjectCredential["roles"] = [];
      for (const { ident, role, policy, policyHcl } of planned) {
        await baoFetch({
          path: `sys/policies/acl/${policy}`,
          method: "POST",
          namespace,
          body: { policy: policyHcl },
        });
        await baoFetch({
          path: `auth/${mount}/role/${role}`,
          method: "POST",
          namespace,
          body: { token_policies: [policy], token_ttl: vars.ttl || "1h", token_max_ttl: "4h" },
        });
        const rid = await baoFetch<{ data: { role_id: string } }>({
          path: `auth/${mount}/role/${role}/role-id`,
          namespace,
        });
        const sid = await baoFetch<{ data: { secret_id: string } }>({
          path: `auth/${mount}/role/${role}/secret-id`,
          method: "POST",
          namespace,
          body: {},
        });
        issued.push({ env: ident, role, roleId: rid.data.role_id, secretId: sid.data.secret_id, policy, mount });
        roles.push({ env: ident, role, policy });
      }

      const definition: ProjectCredential = {
        project,
        level: vars.level,
        env: vars.env,
        mount,
        ttl: vars.ttl,
        paths: vars.paths ?? [],
        roles,
        createdAt: Date.now(),
      };
      try {
        await save([...existing, definition]);
      } catch (err) {
        await deleteCredentialResources(definition, namespace);
        throw err;
      }
      return { definition, issued };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-credentials", namespace] });
      qc.invalidateQueries({ queryKey: ["policies", namespace] });
    },
  });
}

/** Generate a fresh secret_id and destroy every older accessor for one role. */
export function useRotateSecretId() {
  const { namespace } = useNamespace();
  return useMutation({
    mutationFn: async (vars: { mount: string; role: string }): Promise<string> => {
      const path = `auth/${stripSlash(vars.mount)}/role/${vars.role}`;
      const res = await baoFetch<{ data: { secret_id: string; secret_id_accessor: string } }>({
        path: `${path}/secret-id`,
        method: "POST",
        namespace,
        body: {},
      });
      const listed = await baoFetch<{ data: { secret_id_accessors?: string[] } }>({ path: `${path}/secret-id`, namespace, list: true });
      for (const accessor of listed.data?.secret_id_accessors ?? []) {
        if (accessor !== res.data.secret_id_accessor) {
          await baoFetch({ path: `${path}/secret-id-accessor/destroy`, method: "POST", namespace, body: { secret_id_accessor: accessor } });
        }
      }
      return res.data.secret_id;
    },
  });
}

export async function deleteCredentialResources(cred: ProjectCredential, namespace: string): Promise<void> {
  const mount = safeAuthMount(cred.mount);
  if (!mount) throw new Error("Invalid AppRole mount");
  for (const r of cred.roles) {
    const role = safeBaoName(r.role);
    const policy = safeBaoName(r.policy);
    if (!role || !policy) throw new Error("Invalid stored role or policy name");
    for (const path of [`auth/${mount}/role/${role}`, `sys/policies/acl/${policy}`]) {
      try {
        await baoFetch({ path, method: "DELETE", namespace });
      } catch (err) {
        if (!(err instanceof BaoError && err.status === 404)) throw err;
      }
    }
  }
}

/** Revoke: delete every per-env AppRole + policy, then drop the definition. */
export function useRevokeProjectCredential() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const save = useSaveProjectCredentials();
  return useMutation({
    meta: { success: "Project credential revoked", silentError: true },
    mutationFn: async (vars: { cred: ProjectCredential }) => {
      await deleteCredentialResources(vars.cred, namespace);
      const existing = await fetchProjectCredentials(namespace);
      await save(existing.filter((c) => !sameCred(c, vars.cred.project, vars.cred.env)));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-credentials", namespace] });
      qc.invalidateQueries({ queryKey: ["policies", namespace] });
    },
  });
}
