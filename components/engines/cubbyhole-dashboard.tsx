"use client";

import { Box, ChevronRight, FileKey, Folder, Pencil, Plus } from "lucide-react";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { QueryError } from "@/components/query-error";
import {
  EditorHandle,
  KvKeyValueEditor,
  KvValueViewer,
} from "@/components/kv/kv-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogCancel } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaoError } from "@/lib/bao-client";
import {
  useCubbyholeDelete,
  useCubbyholeList,
  useCubbyholeSecret,
  useCubbyholeWrite,
} from "@/lib/cubbyhole";

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : "Something went wrong";
const join = (...p: string[]) => p.filter(Boolean).join("/").replace(/\/+/g, "/");

export function CubbyholeDashboard({ segments }: { segments: string[] }) {
  const folder = segments.join("/");
  const list = useCubbyholeList(folder);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [path, setPath] = React.useState(folder);
  const [creating, setCreating] = React.useState(false);

  // reset selection when the folder changes (segments come from the URL)
  React.useEffect(() => {
    setPath(folder);
    setSelected(null);
  }, [folder]);

  const keys = list.data ?? [];
  const folders = keys.filter((k) => k.endsWith("/"));
  const secrets = keys.filter((k) => !k.endsWith("/"));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-4 py-3 text-sm">
        <Box className="mr-1 size-4 text-muted-foreground" />
        <button
          className="font-medium hover:underline"
          onClick={() => {
            setPath("");
            setSelected(null);
          }}
        >
          cubbyhole
        </button>
        {path
          ? path.split("/").filter(Boolean).map((seg, i, arr) => (
              <React.Fragment key={i}>
                <ChevronRight className="size-3.5 text-muted-foreground" />
                <button
                  className="hover:underline"
                  onClick={() => {
                    setPath(arr.slice(0, i + 1).join("/"));
                    setSelected(null);
                  }}
                >
                  {seg}
                </button>
              </React.Fragment>
            ))
          : null}
        <span className="ml-auto">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> New secret
          </Button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-72 shrink-0 overflow-auto border-r">
          <CurrentList
            folder={path}
            onPickFolder={(f) => {
              setPath(join(path, f));
              setSelected(null);
            }}
            onPickSecret={(s) => setSelected(join(path, s))}
            selected={selected}
            folders={folder === path ? folders : undefined}
            secrets={folder === path ? secrets : undefined}
          />
        </div>
        <div className="min-w-0 flex-1">
          {selected ? (
            <SecretDetail path={selected} onDeleted={() => setSelected(null)} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Per-token private storage. Select a secret, or create one.
            </div>
          )}
        </div>
      </div>

      {creating ? (
        <CreateDialog
          folder={path}
          onClose={() => setCreating(false)}
          onCreated={(p) => {
            setCreating(false);
            setSelected(p);
          }}
        />
      ) : null}
    </div>
  );
}

// the list refetches per-folder; when navigating in-page we re-query
function CurrentList({
  folder,
  onPickFolder,
  onPickSecret,
  selected,
  folders,
  secrets,
}: {
  folder: string;
  onPickFolder: (f: string) => void;
  onPickSecret: (s: string) => void;
  selected: string | null;
  folders?: string[];
  secrets?: string[];
}) {
  const live = useCubbyholeList(folder);
  const keys = live.data ?? [];
  const fs = folders ?? keys.filter((k) => k.endsWith("/"));
  const ss = secrets ?? keys.filter((k) => !k.endsWith("/"));

  if (live.isLoading) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (live.isError) return <QueryError error={live.error} what="cubbyhole contents" className="m-3" />;
  if (fs.length === 0 && ss.length === 0)
    return <p className="p-4 text-sm text-muted-foreground">Nothing stored here.</p>;

  return (
    <ul className="p-2">
      {fs.map((f) => (
        <li key={f}>
          <button
            onClick={() => onPickFolder(f)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <Folder className="size-4 text-muted-foreground" />
            <span className="truncate">{f.replace(/\/$/, "")}</span>
          </button>
        </li>
      ))}
      {ss.map((s) => (
        <li key={s}>
          <button
            onClick={() => onPickSecret(s)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
              selected?.endsWith(`/${s}`) || selected === s ? "bg-accent font-medium" : ""
            }`}
          >
            <FileKey className="size-4 text-muted-foreground" />
            <span className="truncate">{s}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SecretDetail({ path, onDeleted }: { path: string; onDeleted: () => void }) {
  const secret = useCubbyholeSecret(path);
  const write = useCubbyholeWrite();
  const del = useCubbyholeDelete();
  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const editorRef = React.useRef<EditorHandle>(null);

  React.useEffect(() => {
    setEditing(false);
    setError(null);
  }, [path]);

  async function save() {
    setError(null);
    let data: Record<string, unknown>;
    try {
      data = editorRef.current!.getData();
    } catch (e) {
      return setError(e instanceof Error ? e.message : "Invalid input");
    }
    try {
      await write.mutateAsync({ path, data });
      setEditing(false);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-4">
        <div className="truncate font-mono font-medium">{path}</div>
        <div className="flex gap-2">
          {!editing ? (
            <Button size="sm" variant="outline" disabled={secret.isError} onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
          ) : null}
          <Button size="sm" variant="destructive" onClick={() => setConfirm(true)}>
            Delete
          </Button>
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-3xl">
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          {secret.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : secret.isError ? (
            <QueryError error={secret.error} what="this cubbyhole secret" />
          ) : editing ? (
            <>
              <KvKeyValueEditor ref={editorRef} initial={secret.data ?? {}} />
              <div className="mt-4 flex gap-2">
                <Button onClick={save} disabled={write.isPending}>
                  {write.isPending ? "Saving…" : "Save"}
                </Button>
                <Button variant="outline" onClick={() => { setEditing(false); setError(null); }}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <KvValueViewer data={secret.data ?? {}} />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          await del.mutateAsync(path);
          setConfirm(false);
          onDeleted();
        }}
        title={`Delete "${path}"?`}
        confirmText="delete"
        confirmLabel="Delete"
        pending={del.isPending}
      />
    </div>
  );
}

function CreateDialog({
  folder,
  onClose,
  onCreated,
}: {
  folder: string;
  onClose: () => void;
  onCreated: (path: string) => void;
}) {
  const write = useCubbyholeWrite();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const editorRef = React.useRef<EditorHandle>(null);

  return (
    <Dialog open onClose={onClose} className="max-w-xl">
      <DialogHeader
        title="New cubbyhole secret"
        description={folder ? `In /${folder}` : "At the root"}
        onClose={onClose}
      />
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (!name.trim()) return setError("Name is required");
          const path = join(folder, name.trim());
          try {
            await write.mutateAsync({ path, data: editorRef.current!.getData() });
            onCreated(path);
          } catch (err) {
            setError(errMsg(err));
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <Label>Path / name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" placeholder="e.g. notes/draft" autoFocus />
        </div>
        <div>
          <Label>Data</Label>
          <div className="mt-2">
            <KvKeyValueEditor ref={editorRef} initial={{}} />
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <DialogCancel onClose={onClose} />
          <Button type="submit" disabled={write.isPending}>Create secret</Button>
        </div>
      </form>
    </Dialog>
  );
}
