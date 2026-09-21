"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/base-path";

import { buildAccessPolicy, type AccessLevel, type EnvTarget } from "@/lib/access-policy";
import { resolveEnvs, type EnvSelector } from "@/lib/access-roles";
import { baoFetch, BaoError } from "@/lib/bao-client";
import { safeAuthMount, safeBaoName } from "@/lib/oidc-domains";
import { useNamespace } from "@/lib/namespace";

// A machine identity for an app: one AppRole per environment (isolated), each
// bound to a scoped policy. The store keeps only this non-secret definition.
export type AppCredential = {
  app: string; // client name (also the role/policy prefix), e.g. "backend"
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
export function credNames(app: string, env: string, level: AccessLevel) {
  const a = slug(app);
  const e = slug(env);
  const suffix = level === "viewer" ? "read" : level;
  const id = crypto.randomUUID();
  const name = `${a.slice(0, 40)}-${e.slice(0, 40)}-${id}`;
  return { role: name, policy: `${name}-${suffix}` };
}

/** A stable per-environment identity for naming (folders layout disambiguated). */
export const envIdent = (e: EnvTarget) => (e.envPath ? `${e.mount}-${e.envPath}` : e.mount);

// --- store ---

export function useAppCredentials() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["app-credentials", namespace],
    queryFn: async (): Promise<AppCredential[]> => {
      const res = await fetch(`${API_BASE}/app-credentials`, {
        headers: { "x-vault-namespace": namespace },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { creds?: AppCredential[] };
      return data.creds ?? [];
    },
  });
}

function useSaveAppCredentials() {
  const { namespace } = useNamespace();
  return async (creds: AppCredential[]) => {
    const res = await fetch(`${API_BASE}/app-credentials`, {
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

const sameCred = (a: AppCredential, app: string, env: EnvSelector) =>
  a.app === app && JSON.stringify(a.env) === JSON.stringify(env);

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
 * Issue an app credential: for EACH resolved environment, write a scoped policy,
 * create an AppRole bound to it, and fetch role_id + a fresh secret_id. Per-env
 * isolation: a leak in one env can't read another. Returns the secrets once and
 * persists only the definition.
 */
export function useIssueAppCredential() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const save = useSaveAppCredentials();
  return useMutation({
    meta: { success: "App credential issued", silentError: true },
    mutationFn: async (vars: {
      app: string;
      env: EnvSelector;
      level: AccessLevel;
      mount?: string;
      ttl?: string;
      paths?: string[];
      existing: AppCredential[];
    }): Promise<{ definition: AppCredential; issued: IssuedCred[] }> => {
      const app = safeBaoName(vars.app);
      if (!app) throw new Error("App name contains unsupported characters");
      if (vars.existing.some((c) => sameCred(c, app, vars.env))) {
        throw new Error("This credential already exists. Rotate it, or revoke it before issuing a replacement.");
      }
      const mount = safeAuthMount(vars.mount || "approle");
      if (!mount) throw new Error("Invalid AppRole mount");
      const envs = resolveEnvs(vars.env);
      if (envs.length === 0) throw new Error("No environments matched this selection");

      // Validate all scopes before creating any OpenBao resources.
      const planned = envs.map((e) => ({
        ident: envIdent(e),
        ...credNames(app, envIdent(e), vars.level),
        policyHcl: buildAccessPolicy({ envs: [e], level: vars.level, paths: vars.paths }),
      }));
      await ensureApprole(mount, namespace);
      for (const names of planned) await assertCredentialNamesAvailable(names, mount, namespace);
      await save(vars.existing);

      const issued: IssuedCred[] = [];
      const roles: AppCredential["roles"] = [];
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

      const definition: AppCredential = {
        app,
        level: vars.level,
        env: vars.env,
        mount,
        ttl: vars.ttl,
        paths: vars.paths ?? [],
        roles,
        createdAt: Date.now(),
      };
      try {
        await save([...vars.existing, definition]);
      } catch (err) {
        await deleteCredentialResources(definition, namespace);
        throw err;
      }
      return { definition, issued };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-credentials", namespace] });
      qc.invalidateQueries({ queryKey: ["policies", namespace] });
    },
  });
}

/** Generate a fresh secret_id for one role (rotation); the old one keeps working
 *  until it expires/is removed unless you also revoke prior secret-ids. */
export function useRotateSecretId() {
  const { namespace } = useNamespace();
  return useMutation({
    mutationFn: async (vars: { mount: string; role: string }): Promise<string> => {
      const res = await baoFetch<{ data: { secret_id: string } }>({
        path: `auth/${stripSlash(vars.mount)}/role/${vars.role}/secret-id`,
        method: "POST",
        namespace,
        body: {},
      });
      return res.data.secret_id;
    },
  });
}

export async function deleteCredentialResources(cred: AppCredential, namespace: string): Promise<void> {
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
export function useRevokeAppCredential() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const save = useSaveAppCredentials();
  return useMutation({
    meta: { success: "App credential revoked", silentError: true },
    mutationFn: async (vars: { cred: AppCredential; existing: AppCredential[] }) => {
      await deleteCredentialResources(vars.cred, namespace);
      await save(vars.existing.filter((c) => !sameCred(c, vars.cred.app, vars.cred.env)));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-credentials", namespace] });
      qc.invalidateQueries({ queryKey: ["policies", namespace] });
    },
  });
}
