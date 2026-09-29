"use client";

import { FileText, Plus, Wand2 } from "lucide-react";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DetailPane, ListDetail, ListPane } from "@/components/list-detail";
import { BaoError } from "@/lib/bao-client";
import {
  useDeletePasswordPolicy,
  useGeneratePassword,
  usePasswordPolicies,
  usePasswordPolicy,
  useWritePasswordPolicy,
} from "@/lib/password-policies";
import { useUnsaved } from "@/lib/unsaved";

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : "Something went wrong";

const SAMPLE = `length = 20

rule "charset" {
  charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  min-chars = 1
}

rule "charset" {
  charset = "!@#$%^&*"
  min-chars = 1
}
`;

export default function PasswordPoliciesPage() {
  const list = usePasswordPolicies();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [sample, setSample] = React.useState<string | null>(null);

  const policy = usePasswordPolicy(creating ? null : selected);
  const write = useWritePasswordPolicy();
  const del = useDeletePasswordPolicy();
  const generate = useGeneratePassword();

  // Load once per selection; until the selected policy has loaded, the editor
  // must not show (or save) the previous policy's text.
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);
  if (!creating && selected && policy.data != null && loadedFor !== selected) {
    setLoadedFor(selected);
    setBody(policy.data);
  }
  const ready = creating || (!!selected && loadedFor === selected);

  const dirty = creating
    ? body !== SAMPLE || name.trim() !== ""
    : ready && body !== (policy.data ?? "");
  const guard = useUnsaved(dirty);

  function openNew() {
    setCreating(true);
    setSelected(null);
    setName("");
    setBody(SAMPLE);
    setError(null);
    setSample(null);
  }
  function openExisting(n: string) {
    setCreating(false);
    setSelected(n);
    setName(n);
    setBody("");
    setLoadedFor(null);
    setError(null);
    setSample(null);
  }

  async function save() {
    setError(null);
    const n = name.trim();
    if (!n) return setError("Name is required");
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
      backLabel="All password policies"
    >
      <ListPane className="overflow-auto p-3 md:w-64">
        <Button size="sm" className="mb-2 w-full" onClick={() => guard(openNew)}>
          <Plus /> New policy
        </Button>
        {(list.data?.length ?? 0) > 8 ? (
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter password policies"
            className="mb-2 h-8"
          />
        ) : null}
        {list.isLoading ? (
          <p className="p-2 text-sm text-muted-foreground">Loading…</p>
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
            {list.data?.length === 0 ? (
              <li className="px-2 py-4 text-sm text-muted-foreground">No policies yet.</li>
            ) : null}
          </ul>
        )}
      </ListPane>

      <DetailPane className="overflow-auto p-4 md:p-6">
        {!creating && !selected ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Password policies generate strong passwords for dynamic secrets.
            Select one, or create a new one.
          </div>
        ) : (
          <div className="mx-auto flex h-full max-w-2xl flex-col gap-4">
            <div className="flex items-end gap-3">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="pp-name">Name</Label>
                <Input id="pp-name" value={name} disabled={!creating} onChange={(e) => setName(e.target.value)} className="font-mono" />
              </div>
              {!creating ? (
                <Button variant="destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <Label htmlFor="pp-body">Policy (HCL)</Label>
              {!ready ? (
                policy.isError ? (
                  <p role="alert" className="text-sm text-destructive">{errMsg(policy.error)}</p>
                ) : (
                  <Skeleton className="min-h-40 flex-1" />
                )
              ) : (
                <textarea
                  id="pp-body"
                  value={body}
                  spellCheck={false}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-0 flex-1 rounded-md border bg-transparent p-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              )}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="flex items-center gap-2">
              <Button onClick={save} disabled={write.isPending || !ready}>
                {write.isPending ? "Saving…" : "Save policy"}
              </Button>
              {!creating && selected ? (
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      setSample(await generate.mutateAsync(selected));
                    } catch (e) {
                      setError(errMsg(e));
                    }
                  }}
                  disabled={generate.isPending}
                >
                  <Wand2 /> Generate sample
                </Button>
              ) : null}
            </div>

            {sample ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
                <span className="text-xs text-muted-foreground">sample</span>
                <code className="min-w-0 flex-1 truncate text-sm">{sample}</code>
                <CopyButton value={sample} />
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
        title={`Delete password policy "${selected}"?`}
        confirmText={selected ?? undefined}
        confirmLabel="Delete policy"
        pending={del.isPending}
        error={del.error ? errMsg(del.error) : null}
      />
    </ListDetail>
  );
}
