"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { baoFetch } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";

export type IdentityRef = { id: string; name: string };

type ListWithInfo = {
  data: { keys?: string[]; key_info?: Record<string, { name?: string }> };
};

function toRefs(res: ListWithInfo): IdentityRef[] {
  const keys = res.data?.keys ?? [];
  const info = res.data?.key_info ?? {};
  return keys
    .map((id) => ({ id, name: info[id]?.name ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export function useEntities() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["entities", namespace],
    queryFn: async () => {
      try {
        const res = await baoFetch<ListWithInfo>({ path: "identity/entity/id", namespace, list: true });
        return toRefs(res);
      } catch {
        return [] as IdentityRef[];
      }
    },
  });
}

export type Entity = {
  id: string;
  name: string;
  policies: string[];
  disabled: boolean;
  metadata: Record<string, string> | null;
  aliases: { mount_path: string; name: string }[];
  group_ids?: string[];
  direct_group_ids?: string[];
};

export function useEntity(id: string | null) {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["entity", namespace, id],
    enabled: !!id,
    queryFn: async () => {
      const res = await baoFetch<{ data: Entity }>({ path: `identity/entity/id/${id}`, namespace });
      return res.data;
    },
  });
}

export function useCreateEntity() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Entity created", silentError: true },
    mutationFn: async (vars: { name: string; policies?: string[] }) =>
      baoFetch({
        path: "identity/entity",
        method: "POST",
        namespace,
        body: { name: vars.name, policies: vars.policies ?? [] },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entities", namespace] }),
  });
}

export function useDeleteEntity() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Entity deleted" },
    mutationFn: async (id: string) =>
      baoFetch({ path: `identity/entity/id/${id}`, method: "DELETE", namespace }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entities", namespace] }),
  });
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export function useGroups() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["groups", namespace],
    queryFn: async () => {
      try {
        const res = await baoFetch<ListWithInfo>({ path: "identity/group/id", namespace, list: true });
        return toRefs(res);
      } catch {
        return [] as IdentityRef[];
      }
    },
  });
}

export type Group = {
  id: string;
  name: string;
  type: string;
  policies: string[];
  member_entity_ids: string[] | null;
  metadata: Record<string, string> | null;
};

export function useGroup(id: string | null) {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["group", namespace, id],
    enabled: !!id,
    queryFn: async () => {
      const res = await baoFetch<{ data: Group }>({ path: `identity/group/id/${id}`, namespace });
      return res.data;
    },
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Group created", silentError: true },
    mutationFn: async (vars: { name: string; type: string; policies?: string[] }) =>
      baoFetch({
        path: "identity/group",
        method: "POST",
        namespace,
        body: { name: vars.name, type: vars.type, policies: vars.policies ?? [] },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups", namespace] }),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Group deleted" },
    mutationFn: async (id: string) =>
      baoFetch({ path: `identity/group/id/${id}`, method: "DELETE", namespace }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups", namespace] }),
  });
}

/**
 * Groups with their full details (member lists + policies). Used by the Team
 * view to compute which roles each member holds. Capped for safety.
 */
export function useGroupsDetailed() {
  const { namespace } = useNamespace();
  return useQuery({
    queryKey: ["groups-detailed", namespace],
    queryFn: async (): Promise<Group[]> => {
      let ids: string[] = [];
      try {
        const res = await baoFetch<ListWithInfo>({
          path: "identity/group/id",
          namespace,
          list: true,
        });
        ids = res.data?.keys ?? [];
      } catch {
        return [];
      }
      const groups = await Promise.all(
        ids.slice(0, 200).map(async (id) => {
          try {
            const r = await baoFetch<{ data: Group }>({
              path: `identity/group/id/${id}`,
              namespace,
            });
            return r.data;
          } catch {
            return null;
          }
        }),
      );
      return groups.filter((g): g is Group => !!g);
    },
  });
}

/** Replace a group's member entity list (how the Team view (un)assigns roles). */
export function useSetGroupMembers() {
  const qc = useQueryClient();
  const { namespace } = useNamespace();
  return useMutation({
    meta: { success: "Role updated", silentError: true },
    mutationFn: async (vars: { id: string; member_entity_ids: string[] }) =>
      baoFetch({
        path: `identity/group/id/${vars.id}`,
        method: "POST",
        namespace,
        body: { member_entity_ids: vars.member_entity_ids },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["groups-detailed", namespace] });
      qc.invalidateQueries({ queryKey: ["groups", namespace] });
    },
  });
}
