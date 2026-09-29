"use client";

import { Puzzle } from "lucide-react";

import { usePlugins } from "@/lib/operations";

function Group({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border p-4">
      <h3 className="mb-2 text-sm font-medium capitalize">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None registered.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((p) => (
            <li key={p} className="flex items-center gap-1 rounded bg-secondary px-2 py-1 text-xs">
              <Puzzle className="size-3 text-muted-foreground" />
              <span className="font-mono">{p}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PluginsPage() {
  const plugins = usePlugins();

  return (
    <div className="max-w-3xl px-4 py-6 md:px-8">
      <p className="mb-4 text-sm text-muted-foreground">
        Plugins registered in this instance&apos;s catalog.
      </p>
      {plugins.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : plugins.isError ? (
        <p className="text-sm text-destructive">Could not load the plugin catalog.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <Group title="auth" items={plugins.data?.auth ?? []} />
          <Group title="secret" items={plugins.data?.secret ?? []} />
          <Group title="database" items={plugins.data?.database ?? []} />
        </div>
      )}
    </div>
  );
}
