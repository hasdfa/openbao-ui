"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/base-path";
import { readHttpEnvelope } from "@/lib/http/client";

import {
  buildAccessPolicy,
  type AccessLevel,
  type EnvTarget,
} from "@/lib/access-policy";
import {
  isEnvSelector,
  resolveEnvs,
  type EnvSelector,
} from "@/lib/access-roles";
import { baoFetch, BaoError } from "@/lib/bao-client";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isMaterializedRole(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.env === "string" &&
    typeof value.role === "string" &&
    typeof value.policy === "string"
  );
}

export function isAppCredential(value: unknown): value is AppCredential {
  if (!isRecord(value) || "secretId" in value || "roleId" in value)
    return false;
  return (
    typeof value.app === "string" &&
    (value.level === "viewer" ||
      value.level === "editor" ||
      value.level === "admin") &&
    isEnvSelector(value.env) &&
    typeof value.mount === "string" &&
    (value.ttl === undefined || typeof value.ttl === "string") &&
    isStringArray(value.paths) &&
    Array.isArray(value.roles) &&
    value.roles.every(isMaterializedRole) &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt)
  );
}

const stripSlash = (value: string) => value.replace(/^\/+|\/+$/g, "");

const slug = (s: string) =>
  stripSlash(s)
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

/** Per-environment role + policy names (pure; unit-testable). */
export function credNames(app: string, env: string, level: AccessLevel) {
  const a = slug(app);
  const e = slug(env);
  const suffix = level === "viewer" ? "read" : level;
  return { role: `${a}-${e}`, policy: `${a}-${e}-${suffix}` };
}

/** A stable per-environment identity for naming (folders layout disambiguated). */
export const envIdent = (e: EnvTarget) =>
  e.envPath ? `${e.mount}-${e.envPath}` : e.mount;

// --- store ---

export function useAppCredentials() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["app-credentials", namespace],
    queryFn: async (): Promise<AppCredential[]> => {
      const response = await fetch(`${API_BASE}/app-credentials`, {
        headers: { "x-vault-namespace": namespace },
      });
      const data = await readHttpEnvelope<{ creds: AppCredential[] }>(response);
      return data.creds;
    },
  });
}

function useSaveAppCredentials() {
  const { namespace } = useNamespace();
  return async (creds: AppCredential[]) => {
    const response = await fetch(`${API_BASE}/app-credentials`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-vault-namespace": namespace,
      },
      body: JSON.stringify({ creds }),
    });
    await readHttpEnvelope<{ creds: AppCredential[] }>(response);
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
    if (
      !(
        err instanceof BaoError &&
        /already in use|path is already/i.test(err.errors.join(" "))
      )
    ) {
      throw err;
    }
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
      const app = slug(vars.app);
      if (!app) throw new Error("App name is required");
      const mount = stripSlash(vars.mount || "approle");
      const envs = resolveEnvs(vars.env);
      if (envs.length === 0)
        throw new Error("No environments matched this selection");

      await ensureApprole(mount, namespace);

      const issued: IssuedCred[] = [];
      const roles: AppCredential["roles"] = [];
      for (const e of envs) {
        const ident = envIdent(e);
        const { role, policy } = credNames(app, ident, vars.level);
        const policyHcl = buildAccessPolicy({
          envs: [e],
          level: vars.level,
          paths: vars.paths,
        });
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
          body: {
            token_policies: [policy],
            token_ttl: vars.ttl || "1h",
            token_max_ttl: "4h",
          },
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
        issued.push({
          env: ident,
          role,
          roleId: rid.data.role_id,
          secretId: sid.data.secret_id,
          policy,
          mount,
        });
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
      await save([
        ...vars.existing.filter((c) => !sameCred(c, app, vars.env)),
        definition,
      ]);
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
    mutationFn: async (vars: {
      mount: string;
      role: string;
    }): Promise<string> => {
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

/** Revoke: delete every per-env AppRole + policy, then drop the definition. */
export function useRevokeAppCredential() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const save = useSaveAppCredentials();
  return useMutation({
    meta: { success: "App credential revoked", silentError: true },
    mutationFn: async (vars: {
      cred: AppCredential;
      existing: AppCredential[];
    }) => {
      for (const r of vars.cred.roles) {
        await baoFetch({
          path: `auth/${stripSlash(vars.cred.mount)}/role/${r.role}`,
          method: "DELETE",
          namespace,
        }).catch(() => {});
        await baoFetch({
          path: `sys/policies/acl/${r.policy}`,
          method: "DELETE",
          namespace,
        }).catch(() => {});
      }
      await save(
        vars.existing.filter((c) => !sameCred(c, vars.cred.app, vars.cred.env)),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-credentials", namespace] });
      qc.invalidateQueries({ queryKey: ["policies", namespace] });
    },
  });
}
