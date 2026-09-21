"use client";

import { Pencil, RotateCcw } from "lucide-react";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  EditorHandle,
  KvKeyValueEditor,
  KvValueViewer,
  snapshotKvDraft,
} from "@/components/kv/kv-fields";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { BaoError } from "@/lib/bao-client";
import {
  useKvDeleteMetadata,
  useKvIsV2,
  useKvMetadata,
  useKvSecret,
  useKvVersionAction,
  useKvWrite,
} from "@/lib/kv";
import { useNamespace } from "@/lib/namespace";
import { cn } from "@/lib/utils";

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : "Something went wrong";

function versionStatus(meta?: { deletion_time: string; destroyed: boolean }) {
  if (meta?.destroyed) return { label: "destroyed", cls: "text-destructive" };
  if (meta?.deletion_time) return { label: "deleted", cls: "text-amber-500" };
  return { label: "active", cls: "text-emerald-500" };
}

export function SecretDetail({
  mount,
  secretPath,
  onDeleted,
}: {
  mount: string;
  secretPath: string;
  onDeleted: () => void;
}) {
  // v1 mounts have no versioning — treat unknown (loading) as v2.
  const { namespace } = useNamespace();
  const isV2 = useKvIsV2(mount) !== false;
  const meta = useKvMetadata(mount, secretPath);
  const [version, setVersion] = React.useState<number | undefined>(undefined);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<{
    data: Record<string, unknown>;
    cas: number;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const editorRef = React.useRef<EditorHandle>(null);

  // reset transient state when switching secrets or namespaces
  React.useEffect(() => {
    setVersion(undefined);
    setEditing(false);
    setError(null);
    setDraft(null);
  }, [namespace, mount, secretPath]);

  const currentVersion = meta.data?.current_version;
  const viewing = version ?? currentVersion;
  const secret = useKvSecret(mount, secretPath, viewing);

  const write = useKvWrite(mount, secretPath);
  const softDelete = useKvVersionAction(mount, secretPath, "delete");
  const undelete = useKvVersionAction(mount, secretPath, "undelete");
  const destroy = useKvVersionAction(mount, secretPath, "destroy");
  const deleteAll = useKvDeleteMetadata(mount, secretPath);

  const [confirm, setConfirm] = React.useState<
    null | "deleteVersion" | "destroyVersion" | "deleteSecret"
  >(null);

  if (meta.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (meta.isError || !meta.data) {
    return (
      <div className="p-6 text-sm text-destructive">{errMsg(meta.error)}</div>
    );
  }

  const versionMeta = viewing ? meta.data.versions[String(viewing)] : undefined;
  const isDeleted = !!versionMeta?.deletion_time;
  const isDestroyed = !!versionMeta?.destroyed;
  const isCurrent = viewing === currentVersion;

  const versions = Object.entries(meta.data.versions)
    .map(([v, vmeta]) => ({ version: Number(v), ...vmeta }))
    .sort((a, b) => b.version - a.version);

  async function save() {
    if (!draft) return;
    setError(null);
    let data: Record<string, unknown>;
    try {
      data = editorRef.current!.getData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid input");
      return;
    }
    try {
      await write.mutateAsync({ data, cas: draft.cas });
      setEditing(false);
      setDraft(null);
      setVersion(undefined);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  function beginEditing() {
    if (!secret.data?.data || secret.isError || currentVersion == null) return;
    setError(null);
    const snapshot = snapshotKvDraft(secret.data.data, currentVersion);
    setDraft({ data: snapshot.data, cas: snapshot.cas! });
    setEditing(true);
  }

  async function restore() {
    if (!secret.data?.data) return;
    setError(null);
    try {
      await write.mutateAsync({ data: secret.data.data, cas: currentVersion });
      setVersion(undefined);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-4">
        <div className="min-w-0">
          <div className="truncate font-mono font-medium">{secretPath}</div>
          <div className="text-xs text-muted-foreground">
            {isCurrent ? `version ${viewing}` : `viewing v${viewing} · current v${currentVersion}`}
          </div>
        </div>
        {!editing && isCurrent && !isDeleted && !isDestroyed && secret.isSuccess && secret.data?.data ? (
          <Button size="sm" variant="outline" onClick={beginEditing}>
            <Pencil /> Edit
          </Button>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-3xl">
          {error ? (
            <p className="mb-3 text-sm text-destructive">{error}</p>
          ) : null}

          {/* viewing an older version — gentle banner + one-click restore */}
          {!editing && !isCurrent ? (
            <div className="mb-3 flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                Viewing older version v{viewing}.
              </span>
              {!isDestroyed ? (
                <Button size="sm" variant="outline" onClick={restore}>
                  <RotateCcw /> Restore this version
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* --- the simple default: the values --- */}
          {editing && draft ? (
            <>
              <KvKeyValueEditor
                ref={editorRef}
                initial={draft.data}
              />
              <div className="mt-4 flex gap-2">
                <Button onClick={save} disabled={write.isPending}>
                  {write.isPending ? "Saving…" : "Save new version"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setDraft(null);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : isDestroyed ? (
            <p className="py-6 text-center text-sm text-destructive">
              This version was permanently destroyed.
            </p>
          ) : isDeleted ? (
            <div className="py-6 text-center">
              <p className="mb-3 text-sm text-amber-600">
                This version is soft-deleted.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => undelete.mutate([viewing!])}
              >
                Undelete
              </Button>
            </div>
          ) : secret.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading secret data…</p>
          ) : secret.isError ? (
            <div className="py-6 text-center text-sm text-destructive">
              <p>{errMsg(secret.error)}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => secret.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <KvValueViewer data={secret.data?.data ?? {}} />
          )}

          {/* --- depth on demand: history + advanced, hidden by default --- */}
          {!editing ? (
            <div className="mt-4 flex flex-col gap-3">
              {isV2 ? (
              <Disclosure label="Version history" count={versions.length}>
                <ul className="flex flex-col gap-1">
                  {versions.map((v) => {
                    const status = versionStatus(v);
                    return (
                      <li key={v.version}>
                        <button
                          onClick={() => setVersion(v.version)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                            v.version === viewing && "bg-accent",
                          )}
                        >
                          <span className="font-medium">
                            v{v.version}
                            {v.version === currentVersion ? (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                current
                              </span>
                            ) : null}
                          </span>
                          <span className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">
                              {new Date(v.created_time).toLocaleString()}
                            </span>
                            <span className={cn("text-xs", status.cls)}>
                              {status.label}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Disclosure>
              ) : null}

              <Disclosure label="Advanced & danger zone" tone="danger">
                <div className="flex flex-col gap-3 text-sm">
                  {isV2 && !isDeleted && !isDestroyed ? (
                    <Action
                      title={`Soft-delete v${viewing}`}
                      desc="Hide this version; it can be undeleted later."
                      onClick={() => setConfirm("deleteVersion")}
                    />
                  ) : null}
                  {isV2 && !isDestroyed ? (
                    <Action
                      title={`Destroy v${viewing}`}
                      desc="Permanently remove this version's data."
                      onClick={() => setConfirm("destroyVersion")}
                    />
                  ) : null}
                  <Action
                    title="Delete entire secret"
                    desc="Remove all versions and metadata for this path."
                    onClick={() => setConfirm("deleteSecret")}
                  />
                </div>
              </Disclosure>
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "deleteVersion"}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await softDelete.mutateAsync([viewing!]);
          setConfirm(null);
        }}
        title={`Soft-delete v${viewing}?`}
        description="The version is hidden but can be undeleted later."
        confirmLabel="Soft-delete"
        pending={softDelete.isPending}
      />
      <ConfirmDialog
        open={confirm === "destroyVersion"}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await destroy.mutateAsync([viewing!]);
          setConfirm(null);
        }}
        title={`Permanently destroy v${viewing}?`}
        description="This cannot be undone — the version's data is removed."
        confirmText="destroy"
        confirmLabel="Destroy"
        pending={destroy.isPending}
      />
      <ConfirmDialog
        open={confirm === "deleteSecret"}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await deleteAll.mutateAsync();
          setConfirm(null);
          onDeleted();
        }}
        title="Delete secret and all versions?"
        description={`Permanently removes "${secretPath}" and its entire history + metadata.`}
        confirmText="delete"
        confirmLabel="Delete everything"
        pending={deleteAll.isPending}
      />
    </div>
  );
}

function Action({
  title,
  desc,
  onClick,
}: {
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <Button variant="outline" size="sm" onClick={onClick}>
        {title.startsWith("Delete entire") ? "Delete" : title.split(" ")[0]}
      </Button>
    </div>
  );
}
