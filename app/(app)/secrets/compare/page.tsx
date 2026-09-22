"use client";

import { ArrowLeft, Eye, EyeOff, GitCompare } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import * as React from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { baoFetch } from "@/lib/bao-client";
import { useMounts } from "@/lib/kv";
import { labelKey, useLabels } from "@/lib/labels";
import { useNamespace } from "@/lib/namespace";
import { cn } from "@/lib/utils";

type Column = { mount: string; data: Record<string, unknown> | null; missing: boolean };

export default function ComparePage() {
  const { namespace } = useNamespace();
  const mounts = useMounts();
  const { data: labels } = useLabels();
  const kvMounts = Object.entries(mounts.data ?? {})
    .filter(([, v]) => v.type === "kv" || v.type === "generic")
    .map(([p]) => p.replace(/\/$/, ""));
  // friendly environment name for a mount (falls back to the path)
  const envName = (m: string) =>
    labels?.[labelKey("environment", `${m}/`)]?.label || m;

  const [selected, setSelected] = React.useState<string[]>([]);
  const [path, setPath] = React.useState("");
  const [query, setQuery] = React.useState<{ mounts: string[]; path: string } | null>(null);
  const [show, setShow] = React.useState(false);

  // default-select all kv mounts once they load
  React.useEffect(() => {
    if (kvMounts.length && selected.length === 0) setSelected(kvMounts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounts.data]);

  // Arriving from the browser's "Compare" button: the path is already known, so
  // prefill it and run once the engine list is in — no retyping the path.
  // Read after commit: on a client-side navigation the new URL isn't in
  // window.location yet during the first render.
  const [prefilled, setPrefilled] = React.useState<string | null>(null);
  React.useEffect(() => {
    setPrefilled(new URLSearchParams(window.location.search).get("path") ?? "");
  }, []);
  const [autoRan, setAutoRan] = React.useState(false);
  React.useEffect(() => {
    if (!prefilled || autoRan || selected.length === 0) return;
    setAutoRan(true);
    setPath(prefilled);
    setQuery({ mounts: selected, path: prefilled });
  }, [prefilled, autoRan, selected]);

  const compare = useQuery({
    queryKey: ["kv-compare", namespace, query?.mounts, query?.path],
    enabled: !!query,
    queryFn: async (): Promise<Column[]> => {
      return Promise.all(
        query!.mounts.map(async (mount) => {
          // KV v2 reads at <mount>/data/... with fields under res.data.data;
          // KV v1 / generic read at <mount>/... with fields under res.data.
          const v2 = mounts.data?.[`${mount}/`]?.options?.version === "2";
          try {
            const res = await baoFetch<{
              data: (Record<string, unknown> & { data?: Record<string, unknown> }) | null;
            }>({
              path: v2 ? `${mount}/data/${query!.path}` : `${mount}/${query!.path}`,
              namespace,
            });
            const fields = v2 ? (res.data?.data ?? {}) : (res.data ?? {});
            return { mount, data: fields, missing: false };
          } catch {
            return { mount, data: null, missing: true };
          }
        }),
      );
    },
  });

  const cols = compare.data ?? [];
  const keys = Array.from(
    new Set(cols.flatMap((c) => (c.data ? Object.keys(c.data) : []))),
  ).sort();

  const display = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  function rowDiffers(key: string) {
    const vals = cols
      .filter((c) => c.data && key in c.data)
      .map((c) => display(c.data![key]));
    return new Set(vals).size > 1 || vals.length !== cols.filter((c) => !c.missing).length;
  }

  function toggleMount(m: string) {
    setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));
  }

  return (
    <div className="mx-auto max-w-6xl p-8">
      <Link href="/secrets" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Secrets
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <GitCompare className="size-6" /> Compare environments
          </span>
        }
        description="See a secret's keys side-by-side across KV engines — what's set, missing, or different."
        className="mb-6"
      />

      <form
        className="mb-6 flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (path.trim() && selected.length) setQuery({ mounts: selected, path: path.trim() });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label>Engines to compare</Label>
          <div className="flex flex-wrap gap-2">
            {kvMounts.map((m) => (
              <label
                key={m}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1 text-sm",
                  selected.includes(m) ? "border-primary bg-accent" : "text-muted-foreground",
                )}
              >
                <input type="checkbox" className="accent-[var(--color-primary)]" checked={selected.includes(m)} onChange={() => toggleMount(m)} />
                <span title={m} className={labels?.[labelKey("environment", `${m}/`)]?.label ? "font-medium" : "font-mono"}>
                  {envName(m)}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="cmp-path">Secret path</Label>
            <Input id="cmp-path" value={path} onChange={(e) => setPath(e.target.value)} className="font-mono" placeholder="app/config" />
          </div>
          <Button type="submit" disabled={!path.trim() || !selected.length}>Compare</Button>
        </div>
      </form>

      {compare.isFetching ? (
        <p className="text-sm text-muted-foreground">Comparing…</p>
      ) : query && cols.length ? (
        <div className="overflow-hidden rounded-xl border">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
            <span className="font-mono text-sm">{query.path}</span>
            <Button variant="ghost" size="sm" onClick={() => setShow((s) => !s)}>
              {show ? <EyeOff /> : <Eye />} {show ? "Hide" : "Show"} values
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Key</th>
                  {cols.map((c) => (
                    <th key={c.mount} className="px-3 py-2 font-medium">
                      <span className="normal-case">{envName(c.mount)}</span>
                      {labels?.[labelKey("environment", `${c.mount}/`)]?.label ? (
                        <span className="ml-1 font-mono text-[10px] font-normal text-muted-foreground">
                          {c.mount}
                        </span>
                      ) : null}
                      {c.missing ? <span className="ml-1 text-[10px] text-amber-500">no secret</span> : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {keys.length === 0 ? (
                  <tr>
                    <td colSpan={cols.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                      No keys found at this path in the selected engines.
                    </td>
                  </tr>
                ) : (
                  keys.map((key) => {
                    const differs = rowDiffers(key);
                    return (
                      <tr key={key}>
                        <td className="px-3 py-2 align-top font-mono font-medium">
                          {key}
                          {differs ? (
                            <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-normal text-amber-600">
                              differs
                            </span>
                          ) : null}
                        </td>
                        {cols.map((c) => {
                          const has = c.data && key in c.data;
                          return (
                            <td key={c.mount} className="px-3 py-2 align-top">
                              {has ? (
                                <span className="font-mono text-muted-foreground">
                                  {show ? display(c.data![key]) : "••••••••"}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : query ? (
        <p className="text-sm text-muted-foreground">No data.</p>
      ) : null}
    </div>
  );
}
