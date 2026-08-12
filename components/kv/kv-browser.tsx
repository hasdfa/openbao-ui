"use client";

import {
  ChevronRight,
  FileKey,
  Folder,
  KeyRound,
  Plus,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import * as React from "react";

import { EmptyState } from "@/components/empty-state";
import { SecretDetail } from "@/components/kv/secret-detail";
import {
  EditorHandle,
  KvKeyValueEditor,
} from "@/components/kv/kv-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaoError, baoFetch } from "@/lib/bao-client";
import { useKvIsV2, useKvList } from "@/lib/kv";
import { useNamespace } from "@/lib/namespace";

const join = (...parts: string[]) =>
  parts.filter(Boolean).join("/").replace(/\/+/g, "/");

export function KvBrowser({
  mount,
  segments,
}: {
  mount: string;
  segments: string[];
}) {
  const fullPath = segments.join("/");

  // The URL path is normally a folder. But a deep link (or pasted URL) can point
  // straight at a secret (leaf), where listing it as a folder 404s. Detect that
  // and fall back to listing the parent folder with the leaf auto-selected, so
  // deep links to a secret "just work" instead of showing an error.
  const probe = useKvList(mount, fullPath);
  const looksLikeLeaf =
    segments.length > 0 &&
    probe.isError &&
    probe.error instanceof BaoError &&
    probe.error.status === 404;

  const folderSegs = looksLikeLeaf ? segments.slice(0, -1) : segments;
  const folder = folderSegs.join("/");
  const leafName = looksLikeLeaf ? segments[segments.length - 1] : null;

  // Same query key as `probe` when this isn't a leaf, so there's no extra fetch.
  const list = useKvList(mount, folder);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  // Auto-select a deep-linked leaf, but only once the parent listing confirms it
  // really is a secret there (otherwise just show the folder — no false select).
  React.useEffect(() => {
    if (leafName && (list.data ?? []).includes(leafName)) {
      setSelected(join(folder, leafName));
    }
  }, [leafName, folder, list.data]);

  const keys = list.data ?? [];
  const folders = keys.filter((k) => k.endsWith("/"));
  const secrets = keys.filter((k) => !k.endsWith("/"));

  const base = `/secrets/${mount}`;

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* breadcrumbs */}
      <div className="flex flex-wrap items-center gap-1 border-b px-4 py-3 text-sm">
        <KeyRound className="mr-1 size-4 text-muted-foreground" />
        <Link href={base} className="font-medium hover:underline">
          {mount}
        </Link>
        {segments.map((seg, i) => (
          <React.Fragment key={i}>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <Link
              href={`${base}/${segments.slice(0, i + 1).join("/")}`}
              className="hover:underline"
            >
              {seg}
            </Link>
          </React.Fragment>
        ))}
        <div className="ml-auto">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> New secret
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* key list */}
        <div className="max-h-64 w-full shrink-0 overflow-auto border-b md:max-h-none md:w-72 md:border-b-0 md:border-r">
          {list.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : list.isError ? (
            <p className="p-4 text-sm text-destructive">
              {list.error instanceof BaoError
                ? list.error.errors.join(", ")
                : "Failed to list"}
            </p>
          ) : keys.length === 0 ? (
            <EmptyState
              icon={FileKey}
              title="No secrets here"
              description="Create a secret in this path to get started."
              className="py-10"
            />
          ) : (
            <ul className="p-2">
              {folders.map((f) => (
                <li key={f}>
                  <Link
                    href={`${base}/${join(folder, f)}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <Folder className="size-4 text-muted-foreground" />
                    <span className="truncate">{f.replace(/\/$/, "")}</span>
                  </Link>
                </li>
              ))}
              {secrets.map((s) => (
                <li key={s}>
                  <button
                    onClick={() => setSelected(join(folder, s))}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent ${
                      selected === join(folder, s) ? "bg-accent font-medium" : ""
                    }`}
                  >
                    <FileKey className="size-4 text-muted-foreground" />
                    <span className="truncate">{s}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* detail */}
        <div className="min-w-0 flex-1">
          {selected ? (
            <SecretDetail
              mount={mount}
              secretPath={selected}
              onDeleted={() => setSelected(null)}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon={FileKey}
                title="No secret selected"
                description="Pick a secret from the list to view it, or create a new one."
              />
            </div>
          )}
        </div>
      </div>

      {creating ? (
        <CreateSecretDialog
          mount={mount}
          folder={folder}
          onClose={() => setCreating(false)}
          onCreated={(p) => {
            setCreating(false);
            setSelected(p);
            list.refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function CreateSecretDialog({
  mount,
  folder,
  onClose,
  onCreated,
}: {
  mount: string;
  folder: string;
  onClose: () => void;
  onCreated: (path: string) => void;
}) {
  const { namespace } = useNamespace();
  const v2 = useKvIsV2(mount);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const editorRef = React.useRef<EditorHandle>(null);

  const create = useMutation({
    meta: { success: "Secret created", silentError: true },
    mutationFn: async () => {
      const path = join(folder, name.trim());
      const data = editorRef.current!.getData();
      if (v2 === false) {
        // v1: write fields directly at the mount path (no versioning/cas)
        await baoFetch({ path: `${mount}/${path}`, method: "POST", namespace, body: data });
      } else {
        await baoFetch({
          path: `${mount}/data/${path}`,
          method: "POST",
          namespace,
          body: { data, options: { cas: 0 } }, // cas:0 == create only
        });
      }
      return path;
    },
    onSuccess: onCreated,
    onError: (e) =>
      setError(e instanceof BaoError ? e.errors.join(", ") : "Failed to create"),
  });

  return (
    <Dialog open onClose={onClose} className="max-w-xl">
      <DialogHeader
        title="New secret"
        description={folder ? `In folder /${folder}` : "At the mount root"}
        onClose={onClose}
      />
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!name.trim()) {
            setError("Name is required");
            return;
          }
          create.mutate();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="secret-name">Path / name</Label>
          <Input
            id="secret-name"
            placeholder="e.g. api/stripe (subfolders allowed)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-mono"
            autoFocus
          />
        </div>
        <div>
          <Label>Data</Label>
          <div className="mt-2">
            <KvKeyValueEditor ref={editorRef} initial={{}} />
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create secret"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
