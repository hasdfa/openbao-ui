"use client";

import { FileText, Plus } from "lucide-react";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaoError } from "@/lib/bao-client";
import {
  useDeletePolicy,
  usePolicies,
  usePolicy,
  useWritePolicy,
} from "@/lib/access";

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
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const policy = usePolicy(creating ? null : selected);
  const write = useWritePolicy();
  const del = useDeletePolicy();

  // load fetched policy into the editor
  React.useEffect(() => {
    if (policy.data) setBody(policy.data.policy ?? "");
  }, [policy.data]);

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
    setError(null);
  }

  async function save() {
    setError(null);
    const n = name.trim();
    if (!n) return setError("Policy name is required");
    try {
      await write.mutateAsync({ name: n, policy: body });
      setCreating(false);
      setSelected(n);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <div className="flex min-h-full flex-col md:h-full md:flex-row">
      <aside className="w-full shrink-0 border-b p-3 md:w-64 md:overflow-auto md:border-b-0 md:border-r md:pl-6" aria-label="Policies">
        <Button size="sm" className="mb-2 w-full" onClick={openNew}>
          <Plus /> New policy
        </Button>
        {list.isLoading ? (
          <p className="p-2 text-sm text-muted-foreground">Loading…</p>
        ) : list.isError ? (
          <p className="p-2 text-sm text-destructive">{errMsg(list.error)}</p>
        ) : (
          <ul>
            {(list.data ?? []).map((n) => (
              <li key={n}>
                <button
                  onClick={() => openExisting(n)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
                    selected === n && !creating ? "bg-accent font-medium" : ""
                  }`}
                >
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="truncate font-mono">{n}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="min-w-0 flex-1 p-4 md:min-h-0 md:p-6" aria-label="Policy editor">
        {!creating && !selected ? (
          <div className="flex min-h-32 items-center justify-center text-center text-sm text-muted-foreground md:h-full">
            Select a policy, or create a new one.
          </div>
        ) : (
          <div className="flex min-h-[28rem] flex-col gap-4 md:h-full md:min-h-0">
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
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
              <textarea
                id="pol-body"
                value={body}
                readOnly={readOnly}
                spellCheck={false}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-0 flex-1 rounded-md border bg-transparent p-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            {!readOnly ? (
              <div className="flex gap-2">
                <Button onClick={save} disabled={write.isPending}>
                  {write.isPending ? "Saving…" : "Save policy"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>

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
      />
    </div>
  );
}
