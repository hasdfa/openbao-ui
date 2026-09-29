"use client";

import { FileText, Plus } from "lucide-react";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DetailPane, ListDetail, ListPane } from "@/components/list-detail";
import { BaoError } from "@/lib/bao-client";
import {
  useDeletePolicy,
  usePolicies,
  usePolicy,
  useWritePolicy,
} from "@/lib/access";
import { useUnsaved } from "@/lib/unsaved";

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : "Something went wrong";

const SAMPLE = `# Grant read access to a KV v2 path
path "secret/data/myapp/*" {
  capabilities = ["read", "list"]
}
`;

export default function PoliciesPage() {
  const list = usePolicies();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const policy = usePolicy(creating ? null : selected);
  const write = useWritePolicy();
  const del = useDeletePolicy();

  // Load the fetched policy into the editor once per selection. Until the
  // selected policy itself has loaded, the editor must not show (or save)
  // text that belongs to the previous one.
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);
  if (!creating && selected && policy.data && loadedFor !== selected) {
    setLoadedFor(selected);
    setBody(policy.data.policy ?? "");
  }
  const ready = creating || (!!selected && loadedFor === selected);

  const dirty = creating
    ? body !== SAMPLE || name.trim() !== ""
    : ready && body !== (policy.data?.policy ?? "");
  const guard = useUnsaved(dirty);

  const isRoot = selected === "root" && !creating;
  const readOnly = isRoot;

  function openNew() {
    setCreating(true);
    setSelected(null);
    setName("");
    setBody(SAMPLE);
    setError(null);
  }
  function openExisting(n: string) {
    setCreating(false);
    setSelected(n);
    setName(n);
    setBody("");
    setLoadedFor(null);
    setError(null);
  }

  async function save() {
    setError(null);
    const n = name.trim();
    if (!n) return setError("Policy name is required");
    // Writing a policy is an upsert; creating must not replace an existing one.
    if (creating && list.data?.includes(n)) {
      return setError(`A policy named "${n}" already exists. Open it from the list to edit it.`);
    }
    try {
      await write.mutateAsync({ name: n, policy: body });
      setCreating(false);
      setSelected(n);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <ListDetail
      className="h-full"
      open={creating || !!selected}
      onBack={() => guard(() => {
        setSelected(null);
        setCreating(false);
      })}
      backLabel="All policies"
    >
      {/* list */}
      <ListPane className="overflow-auto p-3 md:w-64">
        <Button size="sm" className="mb-2 w-full" onClick={() => guard(openNew)}>
          <Plus /> New policy
        </Button>
        {(list.data?.length ?? 0) > 8 ? (
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter policies"
            className="mb-2 h-8"
          />
        ) : null}
        {list.isLoading ? (
          <p className="p-2 text-sm text-muted-foreground">Loading…</p>
        ) : list.isError ? (
          <p className="p-2 text-sm text-destructive">{errMsg(list.error)}</p>
        ) : (
          <ul>
            {(list.data ?? [])
              .filter((n) => n.toLowerCase().includes(q.trim().toLowerCase()))
              .map((n) => (
              <li key={n}>
                <button
                  onClick={() => guard(() => openExisting(n))}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
                    selected === n && !creating ? "bg-accent font-medium" : ""
                  }`}
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono">{n}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ListPane>

      {/* editor */}
      <DetailPane className="overflow-auto p-4 md:p-6">
        {!creating && !selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a policy, or create a new one.
          </div>
        ) : (
          <div className="flex h-full flex-col gap-4">
            <div className="flex items-end gap-3">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="pol-name">Policy name</Label>
                <Input
                  id="pol-name"
                  value={name}
                  disabled={!creating}
                  onChange={(e) => setName(e.target.value)}
                  className="font-mono"
                />
              </div>
              {!creating && !isRoot ? (
                <Button
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <Label htmlFor="pol-body">
                Policy (HCL){isRoot ? " · read-only" : ""}
              </Label>
              {!ready ? (
                policy.isError ? (
                  <p role="alert" className="text-sm text-destructive">{errMsg(policy.error)}</p>
                ) : (
                  <Skeleton className="min-h-40 flex-1" />
                )
              ) : (
              <textarea
                id="pol-body"
                value={body}
                readOnly={readOnly}
                spellCheck={false}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-0 flex-1 rounded-md border bg-transparent p-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
              )}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {!readOnly ? (
              <div className="flex gap-2">
                <Button onClick={save} disabled={write.isPending || !ready}>
                  {write.isPending ? "Saving…" : "Save policy"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </DetailPane>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await del.mutateAsync(selected!);
          setConfirmDelete(false);
          setSelected(null);
        }}
        title={`Delete policy "${selected}"?`}
        description="Tokens relying on this policy will lose the granted capabilities."
        confirmText={selected ?? undefined}
        confirmLabel="Delete policy"
        pending={del.isPending}
        error={del.error ? errMsg(del.error) : null}
      />
    </ListDetail>
  );
}
