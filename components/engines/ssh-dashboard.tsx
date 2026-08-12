"use client";

import { Plus, Terminal, Trash2 } from "lucide-react";
import * as React from "react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { BaoError } from "@/lib/bao-client";
import {
  useConfigureSshCa,
  useCreateSshRole,
  useDeleteSshRole,
  useSshCa,
  useSshRoles,
  useSshSign,
} from "@/lib/ssh";

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

export function SshDashboard({ mount }: { mount: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Terminal className="size-4 text-muted-foreground" />
        <span className="font-mono font-medium">{mount}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">ssh</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <CaSection mount={mount} />
          <RolesSection mount={mount} />
          <SignSection mount={mount} />
        </div>
      </div>
    </div>
  );
}

function CaSection({ mount }: { mount: string }) {
  const ca = useSshCa(mount);
  const configure = useConfigureSshCa(mount);

  return (
    <section className="rounded-xl border p-4">
      <h3 className="mb-3 text-sm font-medium">Certificate authority</h3>
      {ca.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : ca.data ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
          <code className="min-w-0 flex-1 truncate text-xs">{ca.data}</code>
          <CopyButton value={ca.data} />
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            No signing key yet. Generate one to start issuing SSH certificates.
          </p>
          <Button size="sm" onClick={() => configure.mutate()} disabled={configure.isPending}>
            Generate signing key
          </Button>
        </div>
      )}
    </section>
  );
}

function RolesSection({ mount }: { mount: string }) {
  const roles = useSshRoles(mount);
  const create = useCreateSshRole(mount);
  const del = useDeleteSshRole(mount);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [allowedUsers, setAllowedUsers] = React.useState("");
  const [defaultUser, setDefaultUser] = React.useState("");
  const [ttl, setTtl] = React.useState("30m");
  const [error, setError] = React.useState<string | null>(null);

  return (
    <section>
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
            <Button variant="ghost" size="icon" title="Delete" onClick={() => del.mutate(r)}><Trash2 /></Button>
          </li>
        ))}
        {roles.data?.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">No roles yet.</li>
        ) : null}
      </ul>

      {open ? (
        <Dialog open onClose={() => setOpen(false)}>
          <DialogHeader title="Add SSH role" description="CA signing role for user certificates." onClose={() => setOpen(false)} />
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              if (!name.trim()) return setError("Name is required");
              try {
                await create.mutateAsync({
                  name: name.trim(),
                  allowed_users: allowedUsers,
                  default_user: defaultUser,
                  ttl,
                });
                setOpen(false);
                setName(""); setAllowedUsers(""); setDefaultUser("");
              } catch (err) {
                setError(errMsg(err));
              }
            }}
          >
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" autoFocus /></Field>
            <Field label="Allowed users (comma-separated)"><Input value={allowedUsers} onChange={(e) => setAllowedUsers(e.target.value)} className="font-mono" placeholder="ubuntu,ec2-user" /></Field>
            <Field label="Default user"><Input value={defaultUser} onChange={(e) => setDefaultUser(e.target.value)} className="font-mono" placeholder="ubuntu" /></Field>
            <Field label="TTL"><Input value={ttl} onChange={(e) => setTtl(e.target.value)} /></Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>Save</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </section>
  );
}

function SignSection({ mount }: { mount: string }) {
  const roles = useSshRoles(mount);
  const sign = useSshSign(mount);
  const [role, setRole] = React.useState("");
  const [pub, setPub] = React.useState("");
  const [signed, setSigned] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  return (
    <section className="rounded-xl border p-4">
      <h3 className="mb-3 text-sm font-medium">Sign a public key</h3>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setSigned("");
          if (!role) return setError("Select a role");
          if (!pub.trim()) return setError("Paste a public key");
          try {
            setSigned(await sign.mutateAsync({ role, public_key: pub.trim() }));
          } catch (err) {
            setError(errMsg(err));
          }
        }}
      >
        <Field label="Role">
          <SelectField
            onValueChange={setRole}
            options={[
              { value: "", label: "— select —" },
              ...(roles.data ?? []).map((item) => ({ value: item, label: item })),
            ]}
            value={role}
          />
        </Field>
        <Field label="SSH public key">
          <textarea
            value={pub}
            onChange={(e) => setPub(e.target.value)}
            placeholder="ssh-rsa AAAA… or ssh-ed25519 AAAA…"
            className="h-24 w-full rounded-md border bg-transparent p-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" size="sm" className="self-start" disabled={sign.isPending}>
          {sign.isPending ? "Signing…" : "Sign key"}
        </Button>
      </form>
      {signed ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <Label>Signed certificate</Label>
            <CopyButton value={signed} />
          </div>
          <pre className="max-h-40 overflow-auto rounded-md border bg-muted/50 p-2 text-xs">{signed}</pre>
        </div>
      ) : null}
    </section>
  );
}
