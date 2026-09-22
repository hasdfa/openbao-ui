"use client";

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { BaoError, baoFetch } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";

// --- response shapes (subset we use) ---

export type UiMount = {
  type: string;
  description?: string;
  accessor?: string;
  options?: Record<string, string> | null;
};

export type KvVersionMeta = {
  created_time: string;
  deletion_time: string;
  destroyed: boolean;
};

export type KvMetadata = {
  current_version: number;
  oldest_version: number;
  max_versions: number;
  cas_required: boolean;
  custom_metadata: Record<string, string> | null;
  created_time: string;
  updated_time: string;
  versions: Record<string, KvVersionMeta>;
};

export type KvSecret = {
  data: Record<string, unknown> | null;
  metadata: {
    version: number;
    created_time: string;
    deletion_time: string;
    destroyed: boolean;
    custom_metadata: Record<string, string> | null;
  };
};

const stripSlash = (s: string) => s.replace(/^\/+|\/+$/g, "");

/**
 * KV v2 vs v1. v2 mounts advertise `options.version === "2"` and expose the
 * `/data` + `/metadata` sub-paths; v1 and `generic` mounts read/write/list at
 * the mount path directly and have no versioning. Returns `undefined` until the
 * mount list has loaded (so callers can avoid firing a wrong-shaped request).
 */
export function useKvIsV2(mount: string): boolean | undefined {
  const { data } = useMounts();
  if (!data) return undefined;
  const info = data[`${stripSlash(mount)}/`];
  return info?.options?.version === "2";
}

// --- queries ---

/** Secret engine mounts visible to the current token (capability-aware). */
export function useMounts() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["mounts", namespace],
    queryFn: async () => {
      const res = await baoFetch<{ data: { secret: Record<string, UiMount> } }>(
        { path: "sys/internal/ui/mounts", namespace },
      );
      return res.data.secret ?? {};
    },
  });
}

/**
 * Enable a KV secrets engine — i.e. create an "environment". Defaults to v2.
 * The BFF operator gate rejects this for non-operators; OpenBao enforces the
 * real `sys/mounts/<path>` capability regardless.
 */
export function useEnableSecretEngine() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Environment created", silentError: true },
    mutationFn: async (vars: { path: string; description?: string; version?: "1" | "2" }) =>
      baoFetch({
        path: `sys/mounts/${stripSlash(vars.path)}`,
        method: "POST",
        namespace,
        body: {
          type: "kv",
          description: vars.description || undefined,
          options: { version: vars.version ?? "2" },
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mounts", namespace] }),
  });
}

/**
 * Disable a secrets engine — destroys the mount and ALL secrets in it. The
 * caller is responsible for confirming intent (typed-confirm) before invoking.
 */
export function useDisableSecretEngine() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Environment disabled", silentError: true },
    mutationFn: async (path: string) =>
      baoFetch({
        path: `sys/mounts/${stripSlash(path)}`,
        method: "DELETE",
        namespace,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mounts", namespace] }),
  });
}

/** Namespaces (best-effort; empty if not permitted or unsupported).
 *  Namespaces are an Enterprise feature — open-source OpenBao returns 404 here,
 *  which is expected. Cache the result and don't retry so we don't re-probe a
 *  known-unsupported endpoint on every navigation (avoidable console noise). */
export function useNamespaces() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["namespaces", namespace],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      try {
        const res = await baoFetch<{ data: { keys: string[] } }>({
          path: "sys/namespaces",
          namespace,
          list: true,
        });
        return res.data?.keys ?? [];
      } catch {
        return [] as string[];
      }
    },
  });
}

/** List keys (folders end with "/") at a path within a KV mount. */
export function useKvList(mount: string, path: string) {
  const { namespace } = useNamespace();
  const v2 = useKvIsV2(mount);
  const m = stripSlash(mount);
  const p = stripSlash(path);
  return useQuery({
    queryKey: ["kv-list", namespace, m, p, v2],
    enabled: v2 !== undefined,
    queryFn: async () => {
      const res = await baoFetch<{ data: { keys: string[] } }>({
        path: v2 ? `${m}/metadata/${p}` : `${m}/${p}`,
        namespace,
        list: true,
      });
      return res.data?.keys ?? [];
    },
  });
}

/**
 * List the same path in several *other* mounts at once, so a browser can show
 * which environments hold a given folder or key. Shares the `kv-list` cache
 * with `useKvList`, so switching environment is already warm.
 */
export function useKvListAcross(
  mounts: { mount: string; v2: boolean }[],
  path: string,
) {
  const { namespace } = useNamespace();
  const p = stripSlash(path);
  return useQueries({
    queries: mounts.map(({ mount, v2 }) => {
      const m = stripSlash(mount);
      return {
        queryKey: ["kv-list", namespace, m, p, v2],
        staleTime: 30_000,
        queryFn: async () => {
          const res = await baoFetch<{ data: { keys: string[] } }>({
            path: v2 ? `${m}/metadata/${p}` : `${m}/${p}`,
            namespace,
            list: true,
          });
          return res.data?.keys ?? [];
        },
      };
    }),
    combine: (results) => {
      const byMount: Record<
        string,
        { keys: Set<string>; loading: boolean; reachable: boolean }
      > = {};
      mounts.forEach(({ mount }, i) => {
        const r = results[i];
        byMount[mount] = {
          keys: new Set(r.data ?? []),
          loading: r.isLoading,
          // a 404 means "path not here", any other failure means "can't tell"
          reachable:
            r.isSuccess ||
            (r.error instanceof BaoError && r.error.status === 404),
        };
      });
      return byMount;
    },
  });
}

/** Read a secret (optionally a specific version). */
export function useKvSecret(mount: string, path: string, version?: number) {
  const { namespace } = useNamespace();
  const v2 = useKvIsV2(mount);
  const m = stripSlash(mount);
  const p = stripSlash(path);
  return useQuery({
    queryKey: ["kv-secret", namespace, m, p, version ?? "latest", v2],
    enabled: !!p && v2 !== undefined,
    queryFn: async () => {
      if (v2) {
        const res = await baoFetch<{ data: KvSecret }>({
          path: `${m}/data/${p}`,
          namespace,
          query: version ? { version } : undefined,
        });
        return res.data;
      }
      // v1: fields live directly under `data`; wrap to the v2-ish shape the UI uses
      const res = await baoFetch<{ data: Record<string, unknown> }>({
        path: `${m}/${p}`,
        namespace,
      });
      return {
        data: res.data ?? {},
        metadata: {
          version: 1,
          created_time: "",
          deletion_time: "",
          destroyed: false,
          custom_metadata: null,
        },
      } as KvSecret;
    },
  });
}

/**
 * Version history + metadata for a secret. Pass `enabled: false` to hold the
 * request back — list rows use that to fetch only once they scroll into view.
 */
export function useKvMetadata(
  mount: string,
  path: string,
  opts?: { enabled?: boolean },
) {
  const { namespace } = useNamespace();
  const v2 = useKvIsV2(mount);
  const m = stripSlash(mount);
  const p = stripSlash(path);
  return useQuery({
    queryKey: ["kv-metadata", namespace, m, p, v2],
    enabled: !!p && v2 !== undefined && (opts?.enabled ?? true),
    queryFn: async () => {
      if (v2) {
        const res = await baoFetch<{ data: KvMetadata }>({
          path: `${m}/metadata/${p}`,
          namespace,
        });
        return res.data;
      }
      // v1 has no versioning — synthesize single-version metadata so the
      // detail view renders (history/soft-delete are hidden for v1).
      return {
        current_version: 1,
        oldest_version: 1,
        max_versions: 0,
        cas_required: false,
        custom_metadata: null,
        created_time: "",
        updated_time: "",
        versions: {
          "1": { created_time: "", deletion_time: "", destroyed: false },
        },
      } as KvMetadata;
    },
  });
}

export type KvRowMeta = { version: number; updated: string | null };

/** How many secrets a listing will fetch row metadata for before giving up. */
export const KV_ROW_META_LIMIT = 100;

/**
 * Current version + last-write time for a batch of secrets, so a listing can
 * answer "when was this last rotated?" without opening each one. Shares the
 * `kv-metadata` cache, so opening a row afterwards is instant. v2 only — v1
 * mounts keep no metadata.
 */
export function useKvRowMeta(mount: string, paths: string[], enabled: boolean) {
  const { namespace } = useNamespace();
  const v2 = useKvIsV2(mount);
  const m = stripSlash(mount);
  const active = enabled && v2 === true && paths.length <= KV_ROW_META_LIMIT;
  return useQueries({
    queries: paths.map((path) => {
      const p = stripSlash(path);
      return {
        queryKey: ["kv-metadata", namespace, m, p, v2],
        enabled: active,
        staleTime: 30_000,
        queryFn: async () => {
          const res = await baoFetch<{ data: KvMetadata }>({
            path: `${m}/metadata/${p}`,
            namespace,
          });
          return res.data;
        },
      };
    }),
    combine: (results) => {
      const meta: Record<string, KvRowMeta> = {};
      paths.forEach((path, i) => {
        const d = results[i].data;
        if (d) {
          meta[path] = {
            version: d.current_version,
            updated: d.updated_time || d.created_time || null,
          };
        }
      });
      return {
        meta,
        loading: active && results.some((r) => r.isLoading),
        available: active,
      };
    },
  });
}

// --- mutations ---

function useInvalidateSecret(mount: string, path: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const m = stripSlash(mount);
  const p = stripSlash(path);
  return () => {
    qc.invalidateQueries({ queryKey: ["kv-secret", namespace, m, p] });
    qc.invalidateQueries({ queryKey: ["kv-metadata", namespace, m, p] });
    qc.invalidateQueries({ queryKey: ["kv-list", namespace, m] });
  };
}

/** Write a new version of a secret. Pass `cas` to guard against races. */
export function useKvWrite(mount: string, path: string) {
  const { namespace } = useNamespace();
  const v2 = useKvIsV2(mount);
  const invalidate = useInvalidateSecret(mount, path);
  const m = stripSlash(mount);
  const p = stripSlash(path);
  return useMutation({
    meta: { success: "Secret saved", silentError: true },
    mutationFn: async (vars: {
      data: Record<string, unknown>;
      cas?: number;
    }) => {
      if (v2 === false) {
        // v1: write the fields directly at the mount path (no versioning/cas)
        return baoFetch({ path: `${m}/${p}`, method: "POST", namespace, body: vars.data });
      }
      const body: Record<string, unknown> = { data: vars.data };
      if (vars.cas !== undefined) body.options = { cas: vars.cas };
      return baoFetch({
        path: `${m}/data/${p}`,
        method: "POST",
        namespace,
        body,
      });
    },
    onSuccess: invalidate,
  });
}

type VersionAction = "delete" | "undelete" | "destroy";

/** Soft-delete / undelete / permanently destroy specific versions. */
export function useKvVersionAction(
  mount: string,
  path: string,
  action: VersionAction,
) {
  const { namespace } = useNamespace();
  const invalidate = useInvalidateSecret(mount, path);
  const m = stripSlash(mount);
  const p = stripSlash(path);
  return useMutation({
    meta: {
      success:
        action === "delete"
          ? "Version soft-deleted"
          : action === "undelete"
            ? "Version restored"
            : "Version destroyed",
    },
    mutationFn: async (versions: number[]) =>
      baoFetch({
        path: `${m}/${action}/${p}`,
        method: "POST",
        namespace,
        body: { versions },
      }),
    onSuccess: invalidate,
  });
}

/**
 * Permanently delete several secrets in one mount. Sequential on purpose — a
 * burst of parallel deletes against a secrets backend is worth avoiding, and
 * the failures need to be named individually. Callers must typed-confirm first.
 */
export function useKvBulkDelete(mount: string) {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  const v2 = useKvIsV2(mount);
  const m = stripSlash(mount);
  return useMutation({
    meta: { silentError: true },
    mutationFn: async (paths: string[]) => {
      const failed: string[] = [];
      for (const raw of paths) {
        const p = stripSlash(raw);
        try {
          await baoFetch({
            path: v2 === false ? `${m}/${p}` : `${m}/metadata/${p}`,
            method: "DELETE",
            namespace,
          });
        } catch (err) {
          // already gone counts as done
          if (err instanceof BaoError && err.status === 404) continue;
          failed.push(p);
        }
      }
      if (failed.length) {
        throw new Error(
          `Deleted ${paths.length - failed.length} of ${paths.length}. Still present: ${failed.join(", ")}`,
        );
      }
      return paths.length;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["kv-list", namespace, m] });
      qc.invalidateQueries({ queryKey: ["kv-metadata", namespace, m] });
      qc.invalidateQueries({ queryKey: ["kv-secret", namespace, m] });
    },
  });
}

/** Permanently delete a secret and ALL its versions + metadata. */
export function useKvDeleteMetadata(mount: string, path: string) {
  const { namespace } = useNamespace();
  const v2 = useKvIsV2(mount);
  const invalidate = useInvalidateSecret(mount, path);
  const m = stripSlash(mount);
  const p = stripSlash(path);
  return useMutation({
    meta: { success: "Secret deleted" },
    mutationFn: async () =>
      baoFetch({
        // v2 removes all versions+metadata; v1 deletes the secret at its path
        path: v2 === false ? `${m}/${p}` : `${m}/metadata/${p}`,
        method: "DELETE",
        namespace,
      }),
    onSuccess: invalidate,
  });
}
