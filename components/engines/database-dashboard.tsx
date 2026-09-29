"use client";

import { Database, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogCancel } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BaoError, baoFetch } from "@/lib/bao-client";
import { useRevokeLease } from "@/lib/access";
import {
  DbCreds,
  useCreateDbConnection,
  useCreateDbRole,
  useDbConnections,
  useDbRoles,
  useDeleteDbRole,
  useGenerateDbCreds,
} from "@/lib/database";
import { useNamespace } from "@/lib/namespace";

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : "Something went wrong";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function DatabaseDashboard({ mount }: { mount: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Database className="size-4 text-muted-foreground" />
        <span className="font-mono font-medium">{mount}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">database</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl">
          <Tabs defaultValue="connections">
            <TabsList className="max-w-xs">
              <TabsTrigger value="connections">Connections</TabsTrigger>
              <TabsTrigger value="roles">Roles</TabsTrigger>
            </TabsList>
            <TabsContent value="connections" className="mt-4"><Connections mount={mount} /></TabsContent>
            <TabsContent value="roles" className="mt-4"><Roles mount={mount} /></TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Connections({ mount }: { mount: string }) {
  const conns = useDbConnections(mount);
  const create = useCreateDbConnection(mount);
  const { namespace } = useNamespace();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ name: "", plugin_name: "postgresql-database-plugin", connection_url: "", username: "", password: "" });
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Connections</h3>
        <Button size="sm" variant="outline" onClick={() => { setError(null); setOpen(true); }}>
          <Plus /> Add connection
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {(conns.data ?? []).map((c) => (
          <li key={c} className="flex items-center gap-2 px-3 py-2 text-sm">
            <Database className="size-4 text-muted-foreground" />
            <span className="font-mono">{c}</span>
          </li>
        ))}
        {conns.isError ? <li className="p-3"><QueryError error={conns.error} what="database connections" /></li> : conns.data?.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">No connections yet.</li>
        ) : null}
      </ul>

      {open ? (
        <Dialog open onClose={() => setOpen(false)} className="max-w-lg">
          <DialogHeader title="Add database connection" onClose={() => setOpen(false)} />
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              if (!f.name.trim()) return setError("Name is required");
              try {
                try {
                  await baoFetch({ path: `${mount.replace(/\/$/, "")}/config/${f.name.trim()}`, namespace });
                  return setError(`A connection named ${f.name.trim()} already exists`);
                } catch (err) {
                  if (!(err instanceof BaoError && err.status === 404)) throw err;
                }
                await create.mutateAsync({
                  name: f.name.trim(),
                  plugin_name: f.plugin_name,
                  connection_url: f.connection_url,
                  username: f.username,
                  password: f.password,
                });
                setOpen(false);
              } catch (err) {
                setError(errMsg(err));
              }
            }}
          >
            <Field label="Name"><Input value={f.name} onChange={set("name")} className="font-mono" autoFocus /></Field>
            <Field label="Plugin"><Input value={f.plugin_name} onChange={set("plugin_name")} className="font-mono" /></Field>
            <Field label="Connection URL"><Input value={f.connection_url} onChange={set("connection_url")} className="font-mono" placeholder="postgresql://{{username}}:{{password}}@host:5432/db" /></Field>
            <div className="flex gap-3">
              <Field label="Root username"><Input value={f.username} onChange={set("username")} /></Field>
              <Field label="Root password"><Input type="password" value={f.password} onChange={set("password")} /></Field>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <DialogCancel onClose={() => setOpen(false)} />
              <Button type="submit" disabled={create.isPending}>Save</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

function Roles({ mount }: { mount: string }) {
  const roles = useDbRoles(mount);
  const create = useCreateDbRole(mount);
  const del = useDeleteDbRole(mount);
  const creds = useGenerateDbCreds(mount);
  const revoke = useRevokeLease();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ name: "", db_name: "", creation_statements: "", default_ttl: "1h" });
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ role: string; creds: DbCreds } | null>(null);
  const [revoking, setRevoking] = React.useState(false);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Roles</h3>
        <Button size="sm" variant="outline" onClick={() => { setError(null); setOpen(true); }}>
          <Plus /> Add role
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {(roles.data ?? []).map((r) => (
          <li key={r} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="font-mono">{r}</span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    setResult({ role: r, creds: await creds.mutateAsync(r) });
                  } catch {
                    /* surfaced via toast */
                  }
                }}
              >
                Generate credentials
              </Button>
              <Button variant="ghost" size="icon" title="Delete" onClick={() => setRemoving(r)}><Trash2 /></Button>
            </div>
          </li>
        ))}
        {roles.isError ? <li className="p-3"><QueryError error={roles.error} what="database roles" /></li> : roles.data?.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">No roles yet.</li>
        ) : null}
      </ul>

      {result ? (
        <div className="mt-4 rounded-md border bg-muted/40 p-3">
          <div className="mb-2 text-sm font-medium">Dynamic credentials for {result.role}</div>
          <CredRow label="username" value={result.creds.username} />
          <CredRow label="password" value={result.creds.password} />
          <CredRow label="lease id" value={result.creds.lease_id} />
          <div className="flex items-center gap-2 py-1 text-xs">
            <span className="w-20 text-muted-foreground">TTL</span>
            <span>{result.creds.lease_duration}s{result.creds.renewable ? " (renewable)" : ""}</span>
          </div>
          <Button variant="destructive" size="sm" className="mt-2" onClick={() => setRevoking(true)}>
            Revoke now
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={revoking}
        onClose={() => setRevoking(false)}
        onConfirm={async () => {
          if (!result) return;
          await revoke.mutateAsync({ lease_id: result.creds.lease_id });
          setRevoking(false);
          setResult(null);
        }}
        title="Revoke these credentials?"
        description="Anything using them loses access immediately."
        confirmLabel="Revoke"
        pending={revoke.isPending}
        error={revoke.error instanceof Error ? revoke.error.message : null}
      />

      {open ? (
        <Dialog open onClose={() => setOpen(false)} className="max-w-lg">
          <DialogHeader title="Add role" onClose={() => setOpen(false)} />
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              if (!f.name.trim()) return setError("Name is required");
              try {
                await create.mutateAsync({
                  name: f.name.trim(),
                  db_name: f.db_name,
                  creation_statements: f.creation_statements,
                  default_ttl: f.default_ttl,
                });
                setOpen(false);
              } catch (err) {
                setError(errMsg(err));
              }
            }}
          >
            <Field label="Name"><Input value={f.name} onChange={set("name")} className="font-mono" autoFocus /></Field>
            <Field label="Connection (db_name)"><Input value={f.db_name} onChange={set("db_name")} className="font-mono" /></Field>
            <Field label="Creation statement (SQL)">
              <textarea
                value={f.creation_statements}
                onChange={(e) => setF((s) => ({ ...s, creation_statements: e.target.value }))}
                placeholder={'CREATE ROLE "{{name}}" WITH LOGIN PASSWORD \'{{password}}\' VALID UNTIL \'{{expiration}}\';'}
                className="h-24 w-full rounded-md border bg-transparent p-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>
            <Field label="Default TTL"><Input value={f.default_ttl} onChange={set("default_ttl")} /></Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <DialogCancel onClose={() => setOpen(false)} />
              <Button type="submit" disabled={create.isPending}>Save</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={async () => { await del.mutateAsync(removing!); setRemoving(null); }}
        title={`Delete role "${removing}"?`}
        confirmLabel="Delete"
        pending={del.isPending}
        error={del.error ? errMsg(del.error) : null}
      />
    </div>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-20 text-xs text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate text-sm">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}
