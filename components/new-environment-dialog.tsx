"use client";

import * as React from "react";

import { ColorPicker, LABEL_COLORS } from "@/components/label-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label as FieldLabel } from "@/components/ui/label";
import { useEnableSecretEngine } from "@/lib/kv";
import { useSetLabel } from "@/lib/labels";

const stripSlash = (s: string) => s.replace(/^\/+|\/+$/g, "");

/**
 * Create an environment in one step: enable a KV v2 mount, then (optionally)
 * write its presentation label — friendly name, color — so it shows up nicely.
 */
export function NewEnvironmentDialog({ onClose }: { onClose: () => void }) {
  const enable = useEnableSecretEngine();
  const setLabel = useSetLabel();

  const [path, setPath] = React.useState("");
  const [label, setLabelText] = React.useState("");
  const [color, setColor] = React.useState<string>(LABEL_COLORS[1]);
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const mount = stripSlash(path);
  const pending = enable.isPending || setLabel.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[a-zA-Z0-9._-]+$/.test(mount)) {
      setError("Name is required (letters, numbers, _ . - — no slashes)");
      return;
    }
    try {
      await enable.mutateAsync({ path: mount, description: description.trim() });
      // Only write a label if the operator gave it presentation metadata.
      if (label.trim() || description.trim()) {
        await setLabel.mutateAsync({
          scope: "environment",
          ref: `${mount}/`,
          label: label.trim() || undefined,
          color,
          description: description.trim() || undefined,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create environment");
    }
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader
        title="New environment"
        description="Enables a KV v2 secrets engine. Projects live as folders inside it (e.g. payments, billing)."
        onClose={onClose}
      />
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <Field label="Name (mount path)">
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="font-mono"
            placeholder="prod"
            autoFocus
          />
        </Field>

        <Field label="Display name (optional)">
          <Input value={label} onChange={(e) => setLabelText(e.target.value)} placeholder="Production" />
        </Field>

        <Field label="Description (optional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this environment holds" />
        </Field>

        <div className="flex flex-col gap-2">
          <FieldLabel>Color</FieldLabel>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create environment"}
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
