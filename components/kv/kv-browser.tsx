"use client";

import { ChevronLeft, GitCompare, Plus } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import * as React from "react";

import {
  KvScopeBar,
  type AppOption,
  type EnvOption,
  type EnvPresence,
} from "@/components/kv/kv-scope";
import { KvTable, type CrossEnv, type Sort } from "@/components/kv/kv-table";
import { SecretDetail } from "@/components/kv/secret-detail";
import {
  EditorHandle,
  KvKeyValueEditor,
} from "@/components/kv/kv-fields";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { buttonVariants, Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { BaoError, baoFetch } from "@/lib/bao-client";
import {
  useKvBulkDelete,
  useKvIsV2,
  useKvList,
  useKvListAcross,
  useKvRowMeta,
  useMounts,
} from "@/lib/kv";
import { labelKey, useLabels } from "@/lib/labels";
import { useNamespace } from "@/lib/namespace";
import { cn } from "@/lib/utils";

const join = (...parts: string[]) =>
  parts.filter(Boolean).join("/").replace(/\/+/g, "/");

export function KvBrowser({
  mount,
  segments,
}: {
  mount: string;
  segments: string[];
}) {
  const { namespace } = useNamespace();
  return (
    <ScopedKvBrowser
      key={`${namespace}:${mount}:${segments.join("/")}`}
      namespace={namespace}
      mount={mount}
      segments={segments}
    />
  );
}

function ScopedKvBrowser({
  namespace,
  mount,
  segments,
}: {
  namespace: string;
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
  const [filter, setFilter] = React.useState("");
  const [sort, setSort] = React.useState<Sort>("name");
  const [deleting, setDeleting] = React.useState<string[] | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  // Auto-select a deep-linked leaf, but only once the parent listing confirms it
  // really is a secret there (otherwise just show the folder — no false select).
  React.useEffect(() => {
    if (leafName && (list.data ?? []).includes(leafName)) {
      setSelected(join(folder, leafName));
    }
  }, [leafName, folder, list.data]);

  const isV2 = useKvIsV2(mount) !== false;
  const mounts = useMounts();
  const { data: labels } = useLabels();

  const envs = React.useMemo<EnvOption[]>(
    () =>
      Object.entries(mounts.data ?? {})
        .filter(([, v]) => v.type === "kv" || v.type === "generic")
        .map(([p, v]) => {
          const m = p.replace(/\/$/, "");
          const lbl = labels?.[labelKey("environment", p)];
          return {
            mount: m,
            v2: v.options?.version === "2",
            name: lbl?.label || m,
            labeled: !!lbl?.label,
            color: lbl?.color ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [mounts.data, labels],
  );
  const otherEnvs = React.useMemo(
    () => envs.filter((e) => e.mount !== mount),
    [envs, mount],
  );

  // One listing per other environment answers both "does this folder exist
  // there" and, per row, "does this exact key exist there".
  const across: CrossEnv = useKvListAcross(otherEnvs, folder);

  // Apps are the folders at the mount root; at the root this is the same query.
  const rootList = useKvList(mount, "");
  const apps = React.useMemo<AppOption[]>(
    () =>
      (rootList.data ?? [])
        .filter((k) => k.endsWith("/"))
        .map((k) => {
          const app = k.replace(/\/$/, "");
          const lbl = labels?.[labelKey("project", app)];
          return {
            app,
            name: lbl?.label || app,
            labeled: !!lbl?.label,
            color: lbl?.color ?? null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rootList.data, labels],
  );

  const keys = React.useMemo(() => list.data ?? [], [list.data]);
  const secretPaths = React.useMemo(
    () => keys.filter((k) => !k.endsWith("/")).map((k) => join(folder, k)),
    [keys, folder],
  );
  const rowMeta = useKvRowMeta(mount, secretPaths, isV2 && list.isSuccess);

  const presence = React.useMemo<Record<string, EnvPresence>>(() => {
    const out: Record<string, EnvPresence> = {
      [mount]: {
        count: list.isSuccess ? keys.length : null,
        loading: list.isLoading,
        reachable:
          list.isSuccess ||
          (list.error instanceof BaoError && list.error.status === 404),
      },
    };
    for (const env of otherEnvs) {
      const a = across[env.mount];
      out[env.mount] = {
        count: a && !a.loading ? a.keys.size : null,
        loading: a?.loading ?? true,
        reachable: a?.reachable ?? false,
      };
    }
    return out;
  }, [mount, keys.length, list.isSuccess, list.isLoading, list.error, otherEnvs, across]);

  const bulkDelete = useKvBulkDelete(mount);

  async function confirmBulkDelete() {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await bulkDelete.mutateAsync(deleting);
      if (selected && deleting.includes(selected)) setSelected(null);
      setDeleting(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  const comparePath = selected ?? folder;

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b">
        <KvScopeBar
          mount={mount}
          segments={folderSegs}
          envs={envs}
          apps={apps}
          presence={presence}
          actions={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> New secret
            </Button>
          }
        />
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col md:grid md:transition-[grid-template-columns] md:duration-200 md:ease-out"
        style={{ gridTemplateColumns: selected ? "1fr 2.2fr" : "1fr 0fr" }}
      >
        {/* list */}
        <section
          className={cn(
            "flex min-h-0 min-w-0 flex-col overflow-hidden",
            selected && "hidden md:flex md:border-r",
          )}
        >
          {list.isLoading ? (
            <ListSkeleton />
          ) : list.isError && !looksLikeLeaf ? (
            <div className="px-6 py-14 text-center">
              <p className="text-sm font-medium text-destructive">
                {list.error instanceof BaoError
                  ? list.error.errors.join(", ")
                  : "Could not list this path"}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Your token may not have <span className="font-mono text-xs">list</span>{" "}
                on <span className="font-mono text-xs">{join(mount, folder)}</span>.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => list.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : (
            <KvTable
              mount={mount}
              folder={folder}
              keys={keys}
              isV2={isV2}
              compact={!!selected}
              selectedPath={selected}
              onSelect={setSelected}
              currentEnv={envs.find((e) => e.mount === mount)}
              otherEnvs={otherEnvs}
              across={across}
              rowMeta={rowMeta.meta}
              metaAvailable={rowMeta.available}
              onDeleteRequest={(paths) => {
                setDeleteError(null);
                setDeleting(paths);
              }}
              onNewSecret={() => setCreating(true)}
              filter={filter}
              onFilterChange={setFilter}
              sort={sort}
              onSortChange={setSort}
            />
          )}
        </section>

        {/* detail */}
        <section
          className={cn(
            "min-h-0 min-w-0 overflow-hidden",
            !selected && "hidden md:block",
          )}
        >
          {selected ? (
            <div className="flex h-full flex-col">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex items-center gap-1 border-b px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:hidden"
              >
                <ChevronLeft className="size-4" /> All keys
              </button>
              <div className="min-h-0 flex-1">
                <SecretDetail
                  key={`${namespace}:${mount}:${selected}`}
                  mount={mount}
                  secretPath={selected}
                  onDeleted={() => setSelected(null)}
                  actions={
                    otherEnvs.length ? (
                      <Link
                        href={`/secrets/compare?path=${encodeURIComponent(comparePath)}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                        title="Compare this secret across environments"
                      >
                        <GitCompare /> Compare
                      </Link>
                    ) : null
                  }
                />
              </div>
            </div>
          ) : null}
        </section>
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

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmBulkDelete}
        title={
          deleting?.length === 1
            ? "Delete this secret?"
            : `Delete ${deleting?.length ?? 0} secrets?`
        }
        description={
          isV2
            ? "Every version and the metadata of each path below is removed. This cannot be undone."
            : "Each path below is removed. This cannot be undone."
        }
        confirmText="delete"
        confirmLabel={
          deleting?.length === 1 ? "Delete secret" : `Delete ${deleting?.length ?? 0}`
        }
        pending={bulkDelete.isPending}
        warning={
          deleting?.length ? (
            <ul className="max-h-40 overflow-auto font-mono text-xs">
              {deleting.map((p) => (
                <li key={p} className="truncate">
                  {mount}/{p}
                </li>
              ))}
            </ul>
          ) : null
        }
        error={deleteError}
      />
    </div>
  );
}

// Uneven widths so the placeholder reads as a list of key names, not a bar chart.
const SKELETON_WIDTHS = ["w-40", "w-28", "w-52", "w-36", "w-24", "w-44"];

function ListSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2 md:px-6">
        <Skeleton className="h-8 w-full max-w-xs rounded-md" />
      </div>
      <ul className="px-4 md:px-6">
        {SKELETON_WIDTHS.map((w, i) => (
          <li key={i} className="flex h-11 items-center gap-3 border-b">
            <Skeleton className="size-3.5 rounded-sm" />
            <Skeleton className="size-4 rounded" />
            <Skeleton className={cn("h-3.5 rounded", w)} />
          </li>
        ))}
      </ul>
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
