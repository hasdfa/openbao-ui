"use client";

import { Plus, Trash2, User, Users } from "lucide-react";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogCancel } from "@/components/ui/dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DetailPane, ListDetail, ListPane } from "@/components/list-detail";
import { BaoError } from "@/lib/bao-client";
import {
  IdentityRef,
  useCreateEntity,
  useCreateGroup,
  useDeleteEntity,
  useDeleteGroup,
  useEntities,
  useEntity,
  useGroup,
  useGroups,
} from "@/lib/identity";

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : "Something went wrong";

export default function IdentityPage() {
  return (
    <div className="px-4 py-6 md:px-8">
      <Tabs defaultValue="entities">
        <TabsList className="max-w-xs">
          <TabsTrigger value="entities">Entities</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
        </TabsList>
        <TabsContent value="entities" className="mt-4">
          <EntitiesPane />
        </TabsContent>
        <TabsContent value="groups" className="mt-4">
          <GroupsPane />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ListColumn({
  title,
  items,
  selectedId,
  onSelect,
  onNew,
  icon,
  error,
}: {
  title: string;
  items: IdentityRef[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  icon: React.ReactNode;
  error?: unknown;
}) {
  return (
    <ListPane className="max-md:mb-4 md:w-64 md:pr-3">
      <Button size="sm" className="mb-2 w-full" onClick={onNew}>
        <Plus /> New {title}
      </Button>
      <ul>
        {error ? <li className="p-2"><QueryError error={error} what={title === "entity" ? "entities" : `${title}s`} /></li> : null}
        {items.map((it) => (
          <li key={it.id}>
            <button
              onClick={() => onSelect(it.id)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
                selectedId === it.id ? "bg-accent font-medium" : ""
              }`}
            >
              {icon}
              <span className="truncate">{it.name}</span>
            </button>
          </li>
        ))}
        {!error && items.length === 0 ? (
          <li className="px-2 py-4 text-sm text-muted-foreground">None yet.</li>
        ) : null}
      </ul>
    </ListPane>
  );
}

function PolicyBadges({ policies }: { policies: string[] }) {
  if (!policies?.length)
    return <span className="text-sm text-muted-foreground">none</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {policies.map((p) => (
        <span key={p} className="rounded bg-secondary px-1.5 py-0.5 text-xs">
          {p}
        </span>
      ))}
    </div>
  );
}

function EntitiesPane() {
  const list = useEntities();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const entity = useEntity(selected);
  const create = useCreateEntity();
  const del = useDeleteEntity();

  return (
    <ListDetail
      className="min-h-[60vh] md:gap-4"
      open={!!selected}
      onBack={() => setSelected(null)}
      backLabel="All entities"
    >
      <ListColumn
        title="entity"
        items={list.data ?? []}
        error={list.isError ? list.error : undefined}
        selectedId={selected}
        onSelect={setSelected}
        onNew={() => setCreating(true)}
        icon={<User className="size-4 text-muted-foreground" />}
      />
      <DetailPane>
        {!entity.data ? (
          <p className="text-sm text-muted-foreground">Select an entity.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="text-lg font-semibold">{entity.data.name}</div>
              <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}>
                <Trash2 /> Delete
              </Button>
            </div>
            <Row label="Policies"><PolicyBadges policies={entity.data.policies} /></Row>
            <Disclosure label="Details">
              <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">ID</dt>
                <dd className="font-mono break-all">{entity.data.id}</dd>
                <dt className="text-muted-foreground">Aliases</dt>
                <dd>
                  {entity.data.aliases?.length ? (
                    <ul>
                      {entity.data.aliases.map((a, i) => (
                        <li key={i} className="font-mono">
                          {a.name}{" "}
                          <span className="text-muted-foreground">@ {a.mount_path}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">none</span>
                  )}
                </dd>
              </dl>
            </Disclosure>
          </div>
        )}
      </DetailPane>

      {creating ? (
        <CreateDialog
          title="entity"
          onClose={() => setCreating(false)}
          onSubmit={async (name, policies) => {
            await create.mutateAsync({ name, policies });
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          await del.mutateAsync(selected!);
          setConfirm(false);
          setSelected(null);
        }}
        title={`Delete entity "${entity.data?.name}"?`}
        confirmText={entity.data?.name}
        confirmLabel="Delete entity"
        pending={del.isPending}
      />
    </ListDetail>
  );
}

function GroupsPane() {
  const list = useGroups();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const group = useGroup(selected);
  const create = useCreateGroup();
  const del = useDeleteGroup();

  return (
    <ListDetail
      className="min-h-[60vh] md:gap-4"
      open={!!selected}
      onBack={() => setSelected(null)}
      backLabel="All groups"
    >
      <ListColumn
        title="group"
        items={list.data ?? []}
        error={list.isError ? list.error : undefined}
        selectedId={selected}
        onSelect={setSelected}
        onNew={() => setCreating(true)}
        icon={<Users className="size-4 text-muted-foreground" />}
      />
      <DetailPane>
        {!group.data ? (
          <p className="text-sm text-muted-foreground">Select a group.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div className="text-lg font-semibold">{group.data.name}</div>
              <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}>
                <Trash2 /> Delete
              </Button>
            </div>
            <Row label="Policies"><PolicyBadges policies={group.data.policies} /></Row>
            <Row label="Members">
              <span className="text-sm text-muted-foreground">
                {group.data.member_entity_ids?.length ?? 0} entit
                {(group.data.member_entity_ids?.length ?? 0) === 1 ? "y" : "ies"}
              </span>
            </Row>
            <Disclosure label="Details">
              <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">ID</dt>
                <dd className="font-mono break-all">{group.data.id}</dd>
                <dt className="text-muted-foreground">Type</dt>
                <dd>{group.data.type}</dd>
              </dl>
            </Disclosure>
          </div>
        )}
      </DetailPane>

      {creating ? (
        <CreateDialog
          title="group"
          onClose={() => setCreating(false)}
          onSubmit={async (name, policies) => {
            await create.mutateAsync({ name, type: "internal", policies });
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          await del.mutateAsync(selected!);
          setConfirm(false);
          setSelected(null);
        }}
        title={`Delete group "${group.data?.name}"?`}
        confirmText={group.data?.name}
        confirmLabel="Delete group"
        pending={del.isPending}
      />
    </ListDetail>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-start gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function CreateDialog({
  title,
  onClose,
  onSubmit,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (name: string, policies: string[]) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [policies, setPolicies] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader title={`New ${title}`} onClose={onClose} />
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (!name.trim()) return setError("Name is required");
          setPending(true);
          try {
            await onSubmit(
              name.trim(),
              policies ? policies.split(",").map((p) => p.trim()).filter(Boolean) : [],
            );
            onClose();
          } catch (err) {
            setError(errMsg(err));
          } finally {
            setPending(false);
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Policies (comma-separated)</Label>
          <Input value={policies} onChange={(e) => setPolicies(e.target.value)} className="font-mono" placeholder="default" />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <DialogCancel onClose={onClose} />
          <Button type="submit" disabled={pending}>Create</Button>
        </div>
      </form>
    </Dialog>
  );
}
