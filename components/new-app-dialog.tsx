"use client";

import * as React from "react";

import { ColorPicker } from "@/components/label-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { useCreateApp } from "@/lib/apps";
import { labelKey, useLabels } from "@/lib/labels";
import { useMounts } from "@/lib/kv";
import { cn } from "@/lib/utils";

/**
 * Register an app (a `project` label) and optionally seed an empty
 * `<app>/config` secret in the chosen environments so the folder exists.
 */
export function NewAppDialog({ onClose }: { onClose: () => void }) {
  const { data: mounts } = useMounts();
  const { data: labels } = useLabels();
  const create = useCreateApp();

  const kvMounts = Object.entries(mounts ?? {})
    .filter(([, v]) => v.type === "kv" || v.type === "generic")
    .map(([p, v]) => ({ mount: p.replace(/\/$/, ""), v2: v.options?.version === "2" }));
  const envName = (m: string) => labels?.[labelKey("environment", `${m}/`)]?.label || m;

  const [app, setApp] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState("blue");
  const [seed, setSeed] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const cleanApp = app.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(cleanApp) || cleanApp === "." || cleanApp === "..") {
      setError("App name is required (letters, numbers, _ . -)");
      return;
    }
    try {
      await create.mutateAsync({
        app: cleanApp,
        label: label.trim() || undefined,
        description: description.trim() || undefined,
        color,
        envs: kvMounts.filter((m) => seed.includes(m.mount)),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create app");
    }
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader
        title="New app"
        description="An app is a folder of secrets inside your environments (e.g. payments/). This registers it and can seed an empty config secret."
        onClose={onClose}
      />
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="App name (folder)">
            <Input value={app} onChange={(e) => setApp(e.target.value)} className="font-mono" placeholder="payments" autoFocus />
          </Field>
          <Field label="Display name (optional)">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Payments service" />
          </Field>
        </div>

        <Field label="Description / owner (optional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Owned by the payments team" />
        </Field>

        <div className="flex flex-col gap-2">
          <FieldLabel>Color</FieldLabel>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        {kvMounts.length ? (
          <div className="flex flex-col gap-2">
            <FieldLabel>Create an empty config in (optional)</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {kvMounts.map((m) => (
                <label
                  key={m.mount}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1 text-sm",
                    seed.includes(m.mount) ? "border-primary bg-accent" : "text-muted-foreground",
                  )}
                >
                  <input
                    type="checkbox"
                    disabled={!m.v2}
                    checked={seed.includes(m.mount)}
                    onChange={() => setSeed((s) => (s.includes(m.mount) ? s.filter((x) => x !== m.mount) : [...s, m.mount]))}
                  />
                  {envName(m.mount)}{!m.v2 ? " (KV v1: register only)" : ""}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Writes <span className="font-mono">{cleanApp || "<app>"}/config</span> so the folder shows up. Leave unchecked to just register the app.
            </p>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create app"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}
