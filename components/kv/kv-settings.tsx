"use client";

import * as React from "react";

import { KvKeyValueEditor, type EditorHandle } from "@/components/kv/kv-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaoError } from "@/lib/bao-client";
import { useKvWriteMetadata, type KvMetadata } from "@/lib/kv";

/**
 * KV v2 per-secret settings. These live on the metadata, not on any version,
 * so saving here never creates a new version of the secret.
 */
export function KvSettings({
  mount,
  path,
  meta,
}: {
  mount: string;
  path: string;
  meta: KvMetadata;
}) {
  const save = useKvWriteMetadata(mount, path);
  const [maxVersions, setMaxVersions] = React.useState(String(meta.max_versions ?? 0));
  const [casRequired, setCasRequired] = React.useState(!!meta.cas_required);
  const [deleteAfter, setDeleteAfter] = React.useState(
    meta.delete_version_after && meta.delete_version_after !== "0s" ? meta.delete_version_after : "",
  );
  const [error, setError] = React.useState<string | null>(null);
  const customRef = React.useRef<EditorHandle>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const max = Number(maxVersions || 0);
    if (!Number.isInteger(max) || max < 0) return setError("Versions to keep must be a whole number (0 = mount default)");
    let custom: Record<string, unknown>;
    try {
      custom = customRef.current?.getData() ?? {};
    } catch (err) {
      return setError(err instanceof Error ? err.message : "Invalid custom metadata");
    }
    if (Object.values(custom).some((v) => typeof v !== "string")) {
      return setError("Custom metadata values must be plain strings");
    }
    try {
      await save.mutateAsync({
        max_versions: max,
        cas_required: casRequired,
        delete_version_after: deleteAfter.trim() || "0s",
        custom_metadata: custom as Record<string, string>,
      });
    } catch (err) {
      setError(err instanceof BaoError ? err.errors.join(", ") : "Could not save settings");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kv-max-versions">Versions to keep</Label>
          <Input
            id="kv-max-versions"
            inputMode="numeric"
            value={maxVersions}
            onChange={(e) => setMaxVersions(e.target.value)}
            className="font-mono"
          />
          <span className="text-xs text-muted-foreground">0 uses the mount&apos;s default. Older versions are pruned.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kv-delete-after">Delete versions after</Label>
          <Input
            id="kv-delete-after"
            placeholder="never"
            value={deleteAfter}
            onChange={(e) => setDeleteAfter(e.target.value)}
            className="font-mono"
          />
          <span className="text-xs text-muted-foreground">A duration like 720h. Empty keeps them until pruned.</span>
        </div>
      </div>
      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={casRequired}
          onChange={(e) => setCasRequired(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--color-primary)]"
        />
        <span>
          <span className="block font-medium">Require check-and-set</span>
          <span className="block text-xs text-muted-foreground">
            Every write must name the version it replaces, so concurrent edits can&apos;t overwrite each other.
          </span>
        </span>
      </label>
      <div className="flex flex-col gap-1.5">
        <Label>Custom metadata</Label>
        <span className="text-xs text-muted-foreground">
          Unversioned notes such as owner or rotation schedule. Never put secret values here: metadata is readable with only metadata access.
        </span>
        <KvKeyValueEditor ref={customRef} initial={meta.custom_metadata ?? {}} />
      </div>
      {error ? <p role="alert" className="text-destructive">{error}</p> : null}
      <div>
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
