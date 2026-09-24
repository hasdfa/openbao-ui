"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { API_BASE } from "@/lib/base-path";
import { deleteCredentialResources, type ProjectCredential } from "@/lib/project-credentials";
import { baoFetch, BaoError } from "@/lib/bao-client";
import { useMounts } from "@/lib/kv";
import { labelKey, useClearLabel, useLabels, useSetLabel, type Label } from "@/lib/labels";
import { useNamespace } from "@/lib/namespace";

export type ProjectInfo = {
  project: string; // folder name, e.g. "payments"
  label?: Label; // project-scope label (friendly name / color / owner)
  envs: string[]; // KV mounts the project folder exists in
};

export type KvMount = { mount: string; v2: boolean };

function kvMountsOf(mounts: Record<string, { type: string; options?: Record<string, string> | null }> | undefined): KvMount[] {
  return Object.entries(mounts ?? {})
    .filter(([, v]) => v.type === "kv" || v.type === "generic")
    .map(([p, v]) => ({ mount: p.replace(/\/$/, ""), v2: v.options?.version === "2" }));
}

/**
 * Projects are top-level folders inside KV environments. This discovers them across
 * every KV mount and merges any `project`-scope labels (friendly name,
 * color, owner) — including label-only projects that have no secrets yet.
 */
export function useProjects() {
  const { namespace } = useNamespace();
  const { data: mounts } = useMounts();
  const { data: labels } = useLabels();
  const kvMounts = kvMountsOf(mounts);

  const discovery = useQuery({
    queryKey: ["project-folders", namespace, kvMounts.map((m) => m.mount).join(",")],
    enabled: !!mounts,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const byProject: Record<string, string[]> = {};
      await Promise.all(
        kvMounts.map(async ({ mount, v2 }) => {
          try {
            const res = await baoFetch<{ data: { keys: string[] } }>({
              path: v2 ? `${mount}/metadata` : `${mount}`,
              namespace,
              list: true,
            });
            for (const k of res.data?.keys ?? []) {
              if (k.endsWith("/")) (byProject[k.replace(/\/$/, "")] ??= []).push(mount);
            }
          } catch {
            // unlistable / empty mount — skip
          }
        }),
      );
      return byProject;
    },
  });

  const projects = React.useMemo<ProjectInfo[]>(() => {
    const byProject = discovery.data ?? {};
    const map = new Map<string, ProjectInfo>();
    for (const [project, envs] of Object.entries(byProject)) {
      map.set(project, {
        project,
        label: labels?.[labelKey("project", project)],
        envs: envs.slice().sort(),
      });
    }
    for (const l of Object.values(labels ?? {})) {
      if (l.scope === "project" && !map.has(l.ref)) {
        map.set(l.ref, { project: l.ref, label: l, envs: [] });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.project.localeCompare(b.project));
  }, [discovery.data, labels]);

  return { projects, isLoading: discovery.isLoading, kvMounts };
}

export async function seedProjectConfigs(project: string, envs: KvMount[], namespace: string): Promise<void> {
  if (envs.some((env) => !env.v2)) {
    throw new Error("Automatic config creation is unavailable for KV v1 because existing data cannot be protected from overwrite.");
  }
  for (const env of envs) {
    try {
      await baoFetch({
        path: `${env.mount}/data/${project}/config`, method: "POST", namespace,
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

/** Register a project: write its project label and (optionally) seed an empty
 *  `<project>/config` secret in the chosen environments so the folder exists. */
export function useCreateProject() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const setLabel = useSetLabel();
  return useMutation({
    meta: { success: "Project created", silentError: true },
    mutationFn: async (vars: {
      project: string;
      label?: string;
      color?: string;
      description?: string;
      envs?: KvMount[];
    }) => {
      if (!vars.project || vars.project === "." || vars.project === "..") {
        throw new Error("Invalid project name");
      }
      await seedProjectConfigs(vars.project, vars.envs ?? [], namespace);
      await setLabel.mutateAsync({
        scope: "project",
        ref: vars.project,
        label: vars.label,
        color: vars.color,
        description: vars.description,
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["project-folders", namespace] });
      qc.invalidateQueries({ queryKey: ["kv-list", namespace] });
    },
  });
}

function folderPath(env: KvMount, path: string) {
  return env.v2 ? `${env.mount}/metadata/${path}` : `${env.mount}/${path}`;
}

/** Recursively list secret paths under a project folder in one environment. */
export async function listProjectSecretPaths(
  project: string,
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
  return walk(project);
}

/** Delete every secret under the project folder in the given environments. */
export async function deleteProjectTrees(
  project: string,
  envs: KvMount[],
  namespace: string,
): Promise<void> {
  for (const env of envs) {
    const paths = await listProjectSecretPaths(project, env, namespace);
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

/** Create the project folder in one more environment without touching existing data. */
export function useSeedProjectInEnv() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Project added to environment", silentError: true },
    mutationFn: async (vars: { project: string; env: KvMount }) => {
      await seedProjectConfigs(vars.project, [vars.env], namespace);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["project-folders", namespace] });
      qc.invalidateQueries({ queryKey: ["kv-list", namespace] });
    },
  });
}

/** Remove the project's secrets from its environments, then drop its presentation label. */
export function useDeleteProject() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const clearLabel = useClearLabel();
  return useMutation({
    meta: { success: "Project deleted", silentError: true },
    mutationFn: async (vars: { project: string; envs: KvMount[] }) => {
      const credRes = await fetch(`${API_BASE}/project-credentials`, {
        headers: { "x-vault-namespace": namespace },
      });
      if (!credRes.ok) {
        throw new Error("Could not list project credentials; the project was not deleted.");
      }
      const data = (await credRes.json()) as { creds?: ProjectCredential[] };
      const mine = (data.creds ?? []).filter((c) => c.project === vars.project);
      for (const cred of mine) {
        await deleteCredentialResources(cred, namespace);
      }
      if (mine.length) {
        const keep = (data.creds ?? []).filter((c) => c.project !== vars.project);
        const save = await fetch(`${API_BASE}/project-credentials`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-vault-namespace": namespace,
          },
          body: JSON.stringify({ creds: keep }),
        });
        if (!save.ok) {
          throw new Error("Could not revoke credentials; the project was not deleted.");
        }
      }
      await deleteProjectTrees(vars.project, vars.envs, namespace);
      await clearLabel.mutateAsync({ scope: "project", ref: vars.project });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["project-folders", namespace] });
      qc.invalidateQueries({ queryKey: ["kv-list", namespace] });
    },
  });
}
