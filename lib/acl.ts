"use client";

import { useQuery } from "@tanstack/react-query";

import { baoFetch } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";

type AclData = {
  root: boolean;
  exact: Record<string, string[]>;
  glob: Record<string, string[]>;
};

type RawCaps = Record<string, { capabilities?: string[] }>;
const mapCaps = (o: RawCaps = {}) =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, v.capabilities ?? []]),
  );

/** The current token's resultant ACL — used to make the nav capability-aware. */
export function useResultantAcl() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["resultant-acl", namespace],
    queryFn: async (): Promise<AclData> => {
      try {
        const res = await baoFetch<{
          data: { root?: boolean; exact_paths?: RawCaps; glob_paths?: RawCaps };
        }>({ path: "sys/internal/ui/resultant-acl", namespace });
        return {
          root: !!res.data.root,
          exact: mapCaps(res.data.exact_paths),
          glob: mapCaps(res.data.glob_paths),
        };
      } catch {
        return { root: false, exact: {}, glob: {} };
      }
    },
  });
}

export type Cap = "create" | "read" | "update" | "patch" | "delete" | "list" | "sudo";

/** The capabilities that govern `path`: an exact rule wins, else the longest glob prefix. */
function matching(acl: AclData, path: string): string[] | null {
  if (acl.exact[path]) return acl.exact[path];
  let best: string | null = null;
  for (const prefix of Object.keys(acl.glob)) {
    if (path.startsWith(prefix) && (best === null || prefix.length > best.length)) best = prefix;
  }
  return best === null ? null : acl.glob[best];
}

/** OpenBao semantics: deny beats everything, root allows everything. */
export function allows(caps: string[] | null | undefined, need: readonly Cap[]): boolean {
  if (!caps || caps.includes("deny")) return false;
  if (caps.includes("root")) return true;
  return need.some((c) => caps.includes(c));
}

const SEE: readonly Cap[] = ["read", "list"];

function canPath(acl: AclData | undefined, path: string, need: readonly Cap[]): boolean {
  if (!acl) return true; // optimistic while loading, so the nav doesn't flicker
  if (acl.root) return true;
  return allows(matching(acl, path), need);
}

/**
 * `can(path, caps?)` for gating navigation. Defaults to "can see it" (read or
 * list); pass the capabilities an action needs, e.g. `can("sys/mounts/x", ["create", "update"])`.
 * Advisory only (the resultant ACL is an approximation); for actions on a
 * concrete path prefer `usePathCaps`, which asks OpenBao directly.
 */
export function useCan() {
  const { data } = useResultantAcl();
  return (path: string, need: readonly Cap[] = SEE) => canPath(data, path, need);
}

/**
 * Authoritative capabilities for concrete paths (`sys/capabilities-self`).
 * `data` is undefined while loading: callers treat that as "allowed" so buttons
 * don't flicker, and disable only once OpenBao has said no.
 */
export function usePathCaps(paths: string[]) {
  const { namespace } = useNamespace();
  const unique = [...new Set(paths.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["path-caps", namespace, ...unique],
    enabled: unique.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const res = await baoFetch<{ data: Record<string, unknown> }>({
        path: "sys/capabilities-self",
        method: "POST",
        namespace,
        body: { paths: unique },
      });
      const out: Record<string, string[]> = {};
      for (const p of unique) {
        const v = res.data[p];
        out[p] = Array.isArray(v) ? (v as string[]) : [];
      }
      return out;
    },
  });
}
