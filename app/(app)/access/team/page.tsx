"use client";

import { Check, KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, User, Users, X } from "lucide-react";
import * as React from "react";

import { GrantAccessDialog } from "@/components/grant-access-dialog";
import { colorDot } from "@/components/label-editor";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAccessRoles,
  useApplyAccessRole,
  useDeleteAccessRole,
  type AccessRole,
  type EnvSelector,
} from "@/lib/access-roles";
import {
  useEntities,
  useEntity,
  useGroupsDetailed,
  useSetGroupMembers,
  type Group,
} from "@/lib/identity";
import { useApplyRoleTemplate, useRoleTemplates } from "@/lib/roles";

function envSummary(env: EnvSelector): string {
  if (env.kind === "mounts") return env.mounts.join(", ") || "—";
  return `${env.mount} / ${env.folders.join(", ")}`;
}

export default function TeamPage() {
  const entities = useEntities();
  const groupsQ = useGroupsDetailed();
  const templates = useRoleTemplates();
  const apply = useApplyRoleTemplate();
  const accessRoles = useAccessRoles();
  const applyScoped = useApplyAccessRole();
  const delScoped = useDeleteAccessRole();

  const [selected, setSelected] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [granting, setGranting] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<AccessRole | null>(null);

  const groups = groupsQ.data ?? [];
  const groupNames = new Set(groups.map((g) => g.name));
  const colorByName: Record<string, string> = Object.fromEntries(
    (templates.data ?? []).map((t) => [t.name, t.color]),
  );

  const members = (entities.data ?? []).filter((m) =>
    m.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-5xl p-6">
      <p className="mb-5 text-sm text-muted-foreground">
        Members are OpenBao identity entities (created automatically when people
        sign in, e.g. via Google). A <strong>role</strong> is a policy + group;
        assigning one adds the member to that group. Changes take effect the next
        time the member signs in.
      </p>

      {/* Roles catalog */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-muted-foreground" /> Roles
        </h2>
        {templates.isLoading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {(templates.data ?? []).map((t) => {
              const created = groupNames.has(t.name);
              return (
                <li key={t.name} className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${colorDot(t.color)}`} />
                    <span className="font-medium capitalize">{t.name}</span>
                  </div>
                  <p className="min-h-8 text-xs text-muted-foreground">{t.description}</p>
                  <div className="mt-auto pt-1">
                    {created ? (
                      <Badge variant="success">
                        <Check className="size-3" /> Created
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        disabled={apply.isPending}
                        onClick={() => apply.mutate(t)}
                      >
                        Create role
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Scoped access roles — shareable env groups + app-specific groups */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="size-4 text-muted-foreground" /> Scoped access
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingRole(null);
              setGranting(true);
            }}
          >
            <Plus /> Grant access
          </Button>
        </div>
        {accessRoles.data && accessRoles.data.length > 0 ? (
          <ul className="divide-y rounded-md border">
            {accessRoles.data.map((r) => (
              <li key={r.name} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="font-mono">{r.name}</span>
                <Badge variant="muted" className="capitalize">{r.level}</Badge>
                <Badge variant="primary">{(r.paths ?? []).length} path{(r.paths ?? []).length === 1 ? "" : "s"}</Badge>
                <span className="truncate text-xs text-muted-foreground">{envSummary(r.env)}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Re-apply: rewrite the policy + group"
                    disabled={applyScoped.isPending}
                    onClick={() =>
                      applyScoped.mutate({ role: r, existing: accessRoles.data ?? [] })
                    }
                  >
                    <RefreshCw /> Sync
                  </Button>
                  <Button variant="ghost" size="icon" title="Edit" onClick={() => { setEditingRole(r); setGranting(true); }}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remove definition"
                    onClick={() => delScoped.mutate({ name: r.name, existing: accessRoles.data ?? [] })}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No scoped roles yet. <strong>Grant access</strong> creates a policy + group limited to
            the chosen environments and, optionally, a single application.
          </p>
        )}
      </section>

      {/* Members */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-muted-foreground" /> Members
        </h2>

        {entities.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (entities.data ?? []).length === 0 ? (
          <EmptyState
            icon={User}
            title="No team members yet"
            description="People appear here after they sign in. Set up Google sign-in (Access → Auth Methods) or create an entity in Identity."
          />
        ) : (
          <div className="flex min-h-[50vh] gap-4">
            <div className="w-64 shrink-0 border-r pr-3">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search members…"
                className="mb-2"
              />
              <ul>
                {members.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => setSelected(m.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
                        selected === m.id ? "bg-accent font-medium" : ""
                      }`}
                    >
                      <User className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{m.name}</span>
                    </button>
                  </li>
                ))}
                {members.length === 0 ? (
                  <li className="px-2 py-4 text-sm text-muted-foreground">No matches.</li>
                ) : null}
              </ul>
            </div>

            <div className="min-w-0 flex-1">
              {selected ? (
                <MemberDetail
                  entityId={selected}
                  groups={groups}
                  colorByName={colorByName}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Select a member.</p>
              )}
            </div>
          </div>
        )}
      </section>

      {granting ? (
        <GrantAccessDialog
          existing={accessRoles.data ?? []}
          initial={editingRole ?? undefined}
          onClose={() => {
            setGranting(false);
            setEditingRole(null);
          }}
        />
      ) : null}
    </div>
  );
}

function MemberDetail({
  entityId,
  groups,
  colorByName,
}: {
  entityId: string;
  groups: Group[];
  colorByName: Record<string, string>;
}) {
  const entity = useEntity(entityId);
  const setMembers = useSetGroupMembers();

  const roles = groups.filter((g) => g.member_entity_ids?.includes(entityId));
  const roleIds = new Set(roles.map((g) => g.id));
  const available = groups.filter((g) => !roleIds.has(g.id));

  function addRole(group: Group) {
    const members = [...(group.member_entity_ids ?? []), entityId];
    setMembers.mutate({ id: group.id, member_entity_ids: members });
  }
  function removeRole(group: Group) {
    const members = (group.member_entity_ids ?? []).filter((id) => id !== entityId);
    setMembers.mutate({ id: group.id, member_entity_ids: members });
  }

  if (!entity.data) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="text-lg font-semibold">{entity.data.name}</div>
        <p className="text-sm text-muted-foreground">
          {entity.data.aliases?.length ? (
            <>
              Signs in as{" "}
              {entity.data.aliases.map((a, i) => (
                <span key={i}>
                  {i > 0 ? ", " : ""}
                  <span className="font-mono text-foreground">{a.name}</span>
                  <span className="text-muted-foreground"> @ {a.mount_path}</span>
                </span>
              ))}
            </>
          ) : (
            "No login aliases yet."
          )}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Roles</span>
        <div className="flex flex-wrap items-center gap-2">
          {roles.length === 0 ? (
            <span className="text-sm text-muted-foreground">No roles assigned.</span>
          ) : (
            roles.map((g) => (
              <span
                key={g.id}
                className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-sm"
              >
                <span className={`size-2 rounded-full ${colorDot(colorByName[g.name])}`} />
                <span className="capitalize">{g.name}</span>
                <button
                  type="button"
                  title="Remove role"
                  aria-label={`Remove ${g.name}`}
                  disabled={setMembers.isPending}
                  onClick={() => removeRole(g)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Assign a role</span>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No more roles to assign. Create one above.
          </p>
        ) : (
          <SelectField
            className="w-64"
            disabled={setMembers.isPending}
            onValueChange={(value) => {
              const group = available.find((item) => item.id === value);
              if (group) addRole(group);
            }}
            options={[
              { value: "", label: "Assign role…", disabled: true },
              ...available.map((group) => ({ value: group.id, label: group.name })),
            ]}
            value=""
          />
        )}
      </div>
    </div>
  );
}
