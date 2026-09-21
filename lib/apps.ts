"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { baoFetch, BaoError } from "@/lib/bao-client";
import { useMounts } from "@/lib/kv";
import { labelKey, useClearLabel, useLabels, useSetLabel, type Label } from "@/lib/labels";
import { useNamespace } from "@/lib/namespace";

export type AppInfo = {
  app: string; // folder name, e.g. "payments"
  label?: Label; // application-scope label (friendly name / color / owner)
  envs: string[]; // KV mounts the app folder exists in
};

export type KvMount = { mount: string; v2: boolean };

function kvMountsOf(mounts: Record<string, { type: string; options?: Record<string, string> | null }> | undefined): KvMount[] {
  return Object.entries(mounts ?? {})
    .filter(([, v]) => v.type === "kv" || v.type === "generic")
    .map(([p, v]) => ({ mount: p.replace(/\/$/, ""), v2: v.options?.version === "2" }));
}

/**
 * Apps are top-level folders inside KV environments. This discovers them across
 * every KV mount and merges any `application`-scope labels (friendly name,
 * color, owner) — including label-only apps that have no secrets yet.
 */
export function useApps() {
  const { namespace } = useNamespace();
  const { data: mounts } = useMounts();
  const { data: labels } = useLabels();
  const kvMounts = kvMountsOf(mounts);

  const discovery = useQuery({
    queryKey: ["app-folders", namespace, kvMounts.map((m) => m.mount).join(",")],
    enabled: !!mounts,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const byApp: Record<string, string[]> = {};
      await Promise.all(
        kvMounts.map(async ({ mount, v2 }) => {
          try {
            const res = await baoFetch<{ data: { keys: string[] } }>({
              path: v2 ? `${mount}/metadata` : `${mount}`,
              namespace,
              list: true,
            });
            for (const k of res.data?.keys ?? []) {
              if (k.endsWith("/")) (byApp[k.replace(/\/$/, "")] ??= []).push(mount);
            }
          } catch {
            // unlistable / empty mount — skip
          }
        }),
      );
      return byApp;
    },
  });

  const apps = React.useMemo<AppInfo[]>(() => {
    const byApp = discovery.data ?? {};
    const map = new Map<string, AppInfo>();
    for (const [app, envs] of Object.entries(byApp)) {
      map.set(app, {
        app,
        label: labels?.[labelKey("application", app)],
        envs: envs.slice().sort(),
      });
    }
    for (const l of Object.values(labels ?? {})) {
      if (l.scope === "application" && !map.has(l.ref)) {
        map.set(l.ref, { app: l.ref, label: l, envs: [] });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.app.localeCompare(b.app));
  }, [discovery.data, labels]);

  return { apps, isLoading: discovery.isLoading, kvMounts };
}

export async function seedAppConfigs(app: string, envs: KvMount[], namespace: string): Promise<void> {
  if (envs.some((env) => !env.v2)) {
    throw new Error("Automatic config creation is unavailable for KV v1 because existing data cannot be protected from overwrite.");
  }
  for (const env of envs) {
    try {
      await baoFetch({
        path: `${env.mount}/data/${app}/config`, method: "POST", namespace,
        body: { data: {}, options: { cas: 0 } },
      });
    } catch (err) {
      if (err instanceof BaoError && /check-and-set/i.test(err.errors.join(" "))) {
        continue;
      }
      const reason = err instanceof Error ? err.message : "Write failed";
      throw new Error(`Could not create config in ${env.mount}: ${reason}. Existing secrets were not overwritten; configs in earlier environments may have been created.`);
    }
  }
}

/** Register an app: write its application label and (optionally) seed an empty
 *  `<app>/config` secret in the chosen environments so the folder exists. */
export function useCreateApp() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const setLabel = useSetLabel();
  return useMutation({
    meta: { success: "App created", silentError: true },
    mutationFn: async (vars: {
      app: string;
      label?: string;
      color?: string;
      description?: string;
      envs?: KvMount[];
    }) => {
      await seedAppConfigs(vars.app, vars.envs ?? [], namespace);
      await setLabel.mutateAsync({
        scope: "application",
        ref: vars.app,
        label: vars.label,
        color: vars.color,
        description: vars.description,
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["app-folders", namespace] });
      qc.invalidateQueries({ queryKey: ["kv-list", namespace] });
    },
  });
}

function folderPath(env: KvMount, path: string) {
  return env.v2 ? `${env.mount}/metadata/${path}` : `${env.mount}/${path}`;
}

/** Recursively list secret paths under an app folder in one environment. */
export async function listAppSecretPaths(
  app: string,
  env: KvMount,
  namespace: string,
): Promise<string[]> {
  async function walk(path: string): Promise<string[]> {
    let keys: string[] = [];
    try {
      const res = await baoFetch<{ data: { keys: string[] } }>({
        path: folderPath(env, path),
        namespace,
        list: true,
      });
      keys = res.data?.keys ?? [];
    } catch (err) {
      if (err instanceof BaoError && err.status === 404) return [];
      throw err;
    }
    const out: string[] = [];
    for (const key of keys) {
      const child = `${path}/${key.replace(/\/$/, "")}`;
      if (key.endsWith("/")) out.push(...await walk(child));
      else out.push(child);
    }
    return out;
  }
  return walk(app);
}

/** Delete every secret under the app folder in the given environments. */
export async function deleteAppTrees(
  app: string,
  envs: KvMount[],
  namespace: string,
): Promise<void> {
  for (const env of envs) {
    const paths = await listAppSecretPaths(app, env, namespace);
    for (const path of paths) {
      try {
        await baoFetch({
          path: env.v2 ? `${env.mount}/metadata/${path}` : `${env.mount}/${path}`,
          method: "DELETE",
          namespace,
        });
      } catch (err) {
        if (err instanceof BaoError && err.status === 404) continue;
        const reason = err instanceof Error ? err.message : "Delete failed";
        throw new Error(`Could not delete ${path} in ${env.mount}: ${reason}. Secrets in earlier environments may already be gone.`);
      }
    }
  }
}

/** Create the app folder in one more environment without touching existing data. */
export function useSeedAppInEnv() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "App added to environment", silentError: true },
    mutationFn: async (vars: { app: string; env: KvMount }) => {
      await seedAppConfigs(vars.app, [vars.env], namespace);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["app-folders", namespace] });
      qc.invalidateQueries({ queryKey: ["kv-list", namespace] });
    },
  });
}

/** Remove the app's secrets from its environments, then drop its presentation label. */
export function useDeleteApp() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const clearLabel = useClearLabel();
  return useMutation({
    meta: { success: "App deleted", silentError: true },
    mutationFn: async (vars: { app: string; envs: KvMount[] }) => {
      await deleteAppTrees(vars.app, vars.envs, namespace);
      await clearLabel.mutateAsync({ scope: "application", ref: vars.app });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["app-folders", namespace] });
      qc.invalidateQueries({ queryKey: ["kv-list", namespace] });
    },
  });
}
