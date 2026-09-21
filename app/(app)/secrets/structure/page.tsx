"use client";

import { ArrowLeft, Eye, EyeOff, Network } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { ColorDot } from "@/components/label-editor";
import { PageHeader } from "@/components/page-header";
import { StructureTree, type StructEnv } from "@/components/kv/structure-tree";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useMounts } from "@/lib/kv";
import { labelKey, useLabels } from "@/lib/labels";
import { useNamespace } from "@/lib/namespace";
import { cn } from "@/lib/utils";

export default function StructurePage() {
  const { namespace } = useNamespace();
  const mounts = useMounts();
  const { data: labels } = useLabels();

  const kvMounts = React.useMemo(
    () =>
      Object.entries(mounts.data ?? {})
        .filter(([, v]) => v.type === "kv" || v.type === "generic")
        .map(([p]) => p.replace(/\/$/, "")),
    [mounts.data],
  );
  const env = (m: string) => labels?.[labelKey("environment", `${m}/`)];
  const envName = (m: string) => env(m)?.label || m;
  const envColor = (m: string) => env(m)?.color ?? null;

  // `null` = nothing chosen yet → default to all environments (avoids a
  // default-select effect). Reset on namespace switch so a stale selection from
  // another namespace can't hide the new namespace's environments.
  const [selected, setSelected] = React.useState<string[] | null>(null);
  const [show, setShow] = React.useState(false);
  React.useEffect(() => setSelected(null), [namespace]);

  // Reconcile against the live mount set: an explicit selection still drops
  // mounts that no longer exist; no selection means "all".
  const active = selected
    ? selected.filter((m) => kvMounts.includes(m))
    : kvMounts;

  function toggle(m: string) {
    setSelected((s) => {
      const base = s ?? kvMounts;
      return base.includes(m) ? base.filter((x) => x !== m) : [...base, m];
    });
  }

  // Memoized so an unrelated re-render (e.g. toggling "Show values") doesn't
  // hand StructureTree a fresh array and force the whole tree to reconcile.
  const envs: StructEnv[] = React.useMemo(
    () =>
      kvMounts
        .filter((m) => active.includes(m))
        .map((m) => {
          const l = labels?.[labelKey("environment", `${m}/`)];
          return { mount: m, name: l?.label || m, color: l?.color ?? null };
        }),
    [kvMounts, active, labels],
  );

  return (
    <div className="mx-auto max-w-6xl p-8">
      <Link
        href="/secrets"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Secrets
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Network className="size-6" /> Structure
          </span>
        }
        description="The whole secret tree across your environments. Expand a secret to view, edit, or fill it in where it's missing."
        className="mb-6"
        actions={
          <Button variant="outline" size="sm" onClick={() => setShow((s) => !s)}>
            {show ? <EyeOff /> : <Eye />} {show ? "Hide" : "Show"} values
          </Button>
        }
      />

      <div className="mb-6 flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
        <Label>Environments</Label>
        {mounts.isLoading ? (
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-24 rounded-md" />
            ))}
          </div>
        ) : mounts.isError ? (
          <p className="text-sm text-destructive">
            Could not load mounts. Check your token&apos;s permissions.
          </p>
        ) : kvMounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No KV environments found in this namespace.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {kvMounts.map((m) => (
              <label
                key={m}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1 text-sm",
                  active.includes(m) ? "border-primary bg-accent" : "text-muted-foreground",
                )}
              >
                <input
                  type="checkbox"
                  checked={active.includes(m)}
                  onChange={() => toggle(m)}
                />
                <ColorDot color={envColor(m)} className="size-2.5 shrink-0" />
                <span title={m} className={env(m)?.label ? "font-medium" : "font-mono"}>
                  {envName(m)}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {!mounts.isLoading && !mounts.isError ? (
        <StructureTree key={namespace} envs={envs} show={show} />
      ) : null}
    </div>
  );
}
