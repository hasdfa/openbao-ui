"use client";

import { ScrollText, Plus, ShieldCheck, Trash2 } from "lucide-react";
import * as React from "react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BaoError } from "@/lib/bao-client";
import {
  IssuedCert,
  useCreatePkiRole,
  useDeletePkiRole,
  useGenerateRoot,
  useIssueCert,
  usePkiIssuers,
  usePkiRoles,
} from "@/lib/pki";

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

export function PkiDashboard({ mount }: { mount: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <ScrollText className="size-4 text-muted-foreground" />
        <span className="font-mono font-medium">{mount}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">pki</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl">
          <Tabs defaultValue="issuers">
            <TabsList className="max-w-md">
              <TabsTrigger value="issuers">Issuers</TabsTrigger>
              <TabsTrigger value="roles">Roles</TabsTrigger>
              <TabsTrigger value="issue">Issue</TabsTrigger>
            </TabsList>
            <TabsContent value="issuers" className="mt-4"><Issuers mount={mount} /></TabsContent>
            <TabsContent value="roles" className="mt-4"><Roles mount={mount} /></TabsContent>
            <TabsContent value="issue" className="mt-4"><Issue mount={mount} /></TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function Issuers({ mount }: { mount: string }) {
  const issuers = usePkiIssuers(mount);
  const gen = useGenerateRoot(mount);
  const [cn, setCn] = React.useState("");
  const [ttl, setTtl] = React.useState("87600h");
  const [error, setError] = React.useState<string | null>(null);

  const hasIssuers = (issuers.data ?? []).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="mb-2 text-sm font-medium">Certificate authorities</h3>
        {issuers.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : hasIssuers ? (
          <ul className="divide-y rounded-md border">
            {(issuers.data ?? []).map((id) => (
              <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <ShieldCheck className="size-4 text-emerald-500" />
                <span className="truncate font-mono text-xs">{id}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No CA yet — generate a root below.</p>
        )}
      </div>

      <div className="rounded-xl border p-4">
        <h3 className="mb-3 text-sm font-medium">Generate root CA</h3>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (!cn.trim()) return setError("Common name is required");
            try {
              await gen.mutateAsync({ common_name: cn.trim(), ttl });
              setCn("");
            } catch (err) {
              setError(errMsg(err));
            }
          }}
        >
          <Field label="Common name"><Input value={cn} onChange={(e) => setCn(e.target.value)} placeholder="example.com Root CA" /></Field>
          <Field label="TTL"><Input value={ttl} onChange={(e) => setTtl(e.target.value)} /></Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="sm" className="self-start" disabled={gen.isPending}>
            {gen.isPending ? "Generating…" : "Generate root"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Roles({ mount }: { mount: string }) {
  const roles = usePkiRoles(mount);
  const create = useCreatePkiRole(mount);
  const del = useDeletePkiRole(mount);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [domains, setDomains] = React.useState("");
  const [subdomains, setSubdomains] = React.useState(true);
  const [anyName, setAnyName] = React.useState(false);
  const [maxTtl, setMaxTtl] = React.useState("72h");
  const [error, setError] = React.useState<string | null>(null);

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
            <Button variant="ghost" size="icon" title="Delete" onClick={() => del.mutate(r)}><Trash2 /></Button>
          </li>
        ))}
        {roles.data?.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">No roles yet.</li>
        ) : null}
      </ul>

      {open ? (
        <Dialog open onClose={() => setOpen(false)}>
          <DialogHeader title="Add role" onClose={() => setOpen(false)} />
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              if (!name.trim()) return setError("Name is required");
              try {
                await create.mutateAsync({
                  name: name.trim(),
                  allowed_domains: domains ? domains.split(",").map((d) => d.trim()).filter(Boolean) : [],
                  allow_subdomains: subdomains,
                  allow_any_name: anyName,
                  max_ttl: maxTtl,
                });
                setOpen(false);
                setName(""); setDomains("");
              } catch (err) {
                setError(errMsg(err));
              }
            }}
          >
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" autoFocus /></Field>
            <Field label="Allowed domains (comma-separated)"><Input value={domains} onChange={(e) => setDomains(e.target.value)} className="font-mono" placeholder="example.com" /></Field>
            <Field label="Max TTL"><Input value={maxTtl} onChange={(e) => setMaxTtl(e.target.value)} /></Field>
            <div className="flex gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={subdomains} onChange={(e) => setSubdomains(e.target.checked)} /> Allow subdomains
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={anyName} onChange={(e) => setAnyName(e.target.checked)} /> Allow any name
              </label>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>Save</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

function Issue({ mount }: { mount: string }) {
  const roles = usePkiRoles(mount);
  const issue = useIssueCert(mount);
  const [role, setRole] = React.useState("");
  const [cn, setCn] = React.useState("");
  const [ttl, setTtl] = React.useState("24h");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<IssuedCert | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-3 rounded-xl border p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setResult(null);
          if (!role) return setError("Select a role");
          if (!cn.trim()) return setError("Common name is required");
          try {
            setResult(await issue.mutateAsync({ role, common_name: cn.trim(), ttl }));
          } catch (err) {
            setError(errMsg(err));
          }
        }}
      >
        <h3 className="text-sm font-medium">Issue a certificate</h3>
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
        <Field label="Common name"><Input value={cn} onChange={(e) => setCn(e.target.value)} placeholder="app.example.com" /></Field>
        <Field label="TTL"><Input value={ttl} onChange={(e) => setTtl(e.target.value)} /></Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" size="sm" className="self-start" disabled={issue.isPending}>
          {issue.isPending ? "Issuing…" : "Issue certificate"}
        </Button>
      </form>

      {result ? (
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Serial: </span>
            <span className="font-mono">{result.serial_number}</span>
          </div>
          <CertBlock label="Certificate" value={result.certificate} />
          <CertBlock label="Private key" value={result.private_key} />
          <p className="text-xs text-muted-foreground">The private key is shown once — copy it now.</p>
        </div>
      ) : null}
    </div>
  );
}

function CertBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label>{label}</Label>
        <CopyButton value={value} />
      </div>
      <pre className="max-h-40 overflow-auto rounded-md border bg-muted/50 p-2 text-xs">{value}</pre>
    </div>
  );
}
