"use client";

import * as React from "react";

import { EnvScopePicker, Segmented } from "@/components/env-selector";
import { PathPicker } from "@/components/path-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AccessLevel } from "@/lib/access-policy";
import {
  previewPolicy,
  resolveEnvs,
  useApplyAccessRole,
  type AccessRole,
  type EnvSelector,
} from "@/lib/access-roles";

const LEVELS: AccessLevel[] = ["viewer", "editor", "admin"];

export function GrantAccessDialog({
  existing,
  initial,
  initialProject,
  initialPaths,
  onClose,
}: {
  existing: AccessRole[];
  initial?: AccessRole;
  initialProject?: string;
  initialPaths?: string[];
  onClose: () => void;
}) {
  const apply = useApplyAccessRole();

  const [name, setName] = React.useState(initial?.name ?? initialProject ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [level, setLevel] = React.useState<AccessLevel>(initial?.level ?? "viewer");
  const [env, setEnv] = React.useState<EnvSelector>(initial?.env ?? { kind: "mounts", mounts: [] });
  const [paths, setPaths] = React.useState<string[]>(initial?.paths ?? initialPaths ?? []);
  const [error, setError] = React.useState<string | null>(null);

  const role: AccessRole = {
    name: name.trim(),
    description: description.trim() || undefined,
    level,
    env,
    paths,
  };

  let preview = "";
  let previewError: string | null = null;
  try {
    preview = previewPolicy(role);
  } catch (err) {
    previewError = err instanceof Error ? err.message : "Invalid policy scope";
  }
  const targets = resolveEnvs(env);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[a-zA-Z0-9_.-]+$/.test(role.name)) {
      setError("Name is required (letters, numbers, _ . -)");
      return;
    }
    if (targets.length === 0) {
      setError("Pick at least one environment");
      return;
    }
    if (paths.length === 0) {
      setError("Pick at least one secret path (or “Everything”)");
      return;
    }
    try {
      await apply.mutateAsync({ role, existing });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply");
    }
  }

  return (
    <Dialog open onClose={onClose} className="max-w-2xl">
      <DialogHeader
        title={initial ? "Edit access role" : "Grant access"}
        description="Creates an OpenBao policy + identity group scoped to the chosen environments and secret paths. Assign members to it below."
        onClose={onClose}
      />
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Role name">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" placeholder="payments-prod-viewer" autoFocus disabled={!!initial} />
          </Field>
          <Field label="Access level">
            <Segmented options={LEVELS} value={level} onChange={(v) => setLevel(v as AccessLevel)} />
          </Field>
        </div>

        <Field label="Description (optional)">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this grants" />
        </Field>

        <EnvScopePicker initial={initial?.env} onChange={setEnv} />

        <PathPicker mount={targets[0]?.mount} envPath={targets[0]?.envPath} value={paths} onChange={setPaths} />

        {/* live policy preview */}
        <div className="flex flex-col gap-1">
          <Label>Generated policy</Label>
          <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
            <code>{preview}</code>
          </pre>
        </div>

        {error || previewError ? <p className="text-sm text-destructive">{error || previewError}</p> : null}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={apply.isPending || !!previewError}>
            {apply.isPending ? "Applying…" : initial ? "Save & re-sync" : "Grant access"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
