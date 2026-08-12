"use client";

import { KeyRound, ShieldAlert } from "lucide-react";
import * as React from "react";

import { CopyButton } from "@/components/copy-button";
import { EnvScopePicker, Segmented } from "@/components/env-selector";
import { PathPicker } from "@/components/path-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildAccessPolicy, type AccessLevel } from "@/lib/access-policy";
import {
  credNames,
  envIdent,
  useIssueAppCredential,
  type AppCredential,
  type IssuedCred,
} from "@/lib/app-credentials";
import { resolveEnvs, type EnvSelector } from "@/lib/access-roles";

const LEVELS: AccessLevel[] = ["viewer", "editor"];

/**
 * Wizard to issue an app credential: pick app + environments + permission, see
 * the access + the per-env AppRoles it will create, then reveal role_id/secret_id
 * once with a ready-to-paste login snippet.
 */
export function IssueCredentialDialog({
  existing,
  initialApp,
  initialPaths,
  onClose,
}: {
  existing: AppCredential[];
  initialApp?: string;
  initialPaths?: string[];
  onClose: () => void;
}) {
  const issue = useIssueAppCredential();

  const [app, setApp] = React.useState(initialApp ?? "");
  const [level, setLevel] = React.useState<AccessLevel>("viewer");
  const [env, setEnv] = React.useState<EnvSelector>({ kind: "mounts", mounts: [] });
  const [paths, setPaths] = React.useState<string[]>(
    initialPaths ?? (initialApp ? [`${initialApp}/*`] : []),
  );
  const [ttl, setTtl] = React.useState("1h");
  const [mount, setMount] = React.useState("approle");
  const [error, setError] = React.useState<string | null>(null);
  const [issued, setIssued] = React.useState<IssuedCred[] | null>(null);

  const envs = resolveEnvs(env);
  const cleanApp = app.trim();
  const preview = envs.length && paths.length
    ? buildAccessPolicy({ envs, level, paths })
    : "";
  const roleNames = cleanApp ? envs.map((e) => credNames(cleanApp, envIdent(e), level).role) : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[a-zA-Z0-9_.-]+$/.test(cleanApp)) {
      setError("Client name is required (letters, numbers, _ . -)");
      return;
    }
    if (envs.length === 0) {
      setError("This selection doesn't match any environment");
      return;
    }
    if (paths.length === 0) {
      setError("Pick at least one secret path (or “Everything”)");
      return;
    }
    try {
      const res = await issue.mutateAsync({ app: cleanApp, env, level, mount, ttl, paths, existing });
      setIssued(res.issued);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to issue credential");
    }
  }

  // --- reveal step ---
  if (issued) {
    return (
      <Dialog open onClose={onClose} className="max-w-2xl">
        <DialogHeader
          title="Credentials issued"
          description="One AppRole per environment. The secret_id is shown ONCE — copy it now."
          onClose={onClose}
        />
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Save these in your app&apos;s secret manager or CI now — a{" "}
              <code className="rounded bg-amber-500/15 px-1 py-0.5">secret_id</code> can&apos;t be
              retrieved again (rotate it if it&apos;s lost).
            </span>
          </div>
          {issued.map((c) => (
            <div key={c.role} className="rounded-md border bg-card p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4 text-muted-foreground" /> {c.env}
                <span className="font-mono text-xs text-muted-foreground">({c.role})</span>
              </div>
              <CredRow label="role_id" value={c.roleId} />
              <CredRow label="secret_id" value={c.secretId} />
              <Disclosure label="Use it in your app" className="mt-2">
                <Snippet app={cleanApp} env={c.env} mount={c.mount} roleId={c.roleId} secretId={c.secretId} />
              </Disclosure>
            </div>
          ))}
          <div className="flex justify-end border-t pt-4">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </Dialog>
    );
  }

  // --- form step ---
  return (
    <Dialog open onClose={onClose} className="max-w-2xl">
      <DialogHeader
        title="Issue app credential"
        description="Creates an isolated AppRole (machine identity) per environment, scoped to the secret paths you pick. Your service logs in with role_id + secret_id to get a short-lived token."
        onClose={onClose}
      />
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client name">
            <Input value={app} onChange={(e) => setApp(e.target.value)} className="font-mono" placeholder="backend" autoFocus disabled={!!initialApp} />
          </Field>
          <Field label="Permission">
            <Segmented
              options={LEVELS}
              labels={{ viewer: "Read-only", editor: "Read/write" }}
              value={level}
              onChange={(v) => setLevel(v as AccessLevel)}
            />
          </Field>
        </div>

        <EnvScopePicker initial={undefined} onChange={setEnv} />

        <PathPicker mount={envs[0]?.mount} envPath={envs[0]?.envPath} value={paths} onChange={setPaths} />

        <Disclosure label="Advanced">
          <div className="grid gap-3 pt-1 sm:grid-cols-2">
            <Field label="Token TTL">
              <Input value={ttl} onChange={(e) => setTtl(e.target.value)} className="font-mono" placeholder="1h" />
            </Field>
            <Field label="AppRole mount">
              <Input value={mount} onChange={(e) => setMount(e.target.value)} className="font-mono" placeholder="approle" />
            </Field>
          </div>
        </Disclosure>

        {roleNames.length ? (
          <div className="flex flex-col gap-1">
            <Label>Will create {roleNames.length} AppRole{roleNames.length === 1 ? "" : "s"} (one per environment)</Label>
            <div className="flex flex-wrap gap-1.5">
              {roleNames.map((r) => (
                <span key={r} className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs">{r}</span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <Label>Access granted</Label>
          <pre className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-relaxed">
            <code>{preview || "Pick an app + environments to preview the policy."}</code>
          </pre>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={issue.isPending}>
            {issue.isPending ? "Issuing…" : "Issue credential"}
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

export function CredRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate text-sm">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}

function Snippet({
  app,
  env,
  mount,
  roleId,
  secretId,
}: {
  app: string;
  env: string;
  mount: string;
  roleId: string;
  secretId: string;
}) {
  const addr = typeof window !== "undefined" ? window.location.origin : "https://openbao.example.com";
  // env is the per-env identity; for mount-per-env it equals the KV mount name
  const code = `export BAO_ADDR="${addr}"
export ROLE_ID="${roleId}"
export SECRET_ID="${secretId}"
export BAO_TOKEN=$(bao write -field=token auth/${mount}/login \\
  role_id="$ROLE_ID" secret_id="$SECRET_ID")

bao kv get -mount=${env} ${app}/config`;
  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">bash</span>
        <CopyButton value={code} label="Copy" />
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}
