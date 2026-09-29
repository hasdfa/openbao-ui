"use client";

import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { QueryError } from "@/components/query-error";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogCancel } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaoError } from "@/lib/bao-client";
import { useAuthMethods } from "@/lib/auth-methods";
import {
  useCreateLoginEnforcement,
  useCreateTotpMethod,
  useDeleteLoginEnforcement,
  useDeleteTotpMethod,
  useLoginEnforcements,
  useTotpMethods,
} from "@/lib/mfa";

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : "Something went wrong";

export default function MfaPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8 px-4 py-6 md:px-8">
      <TotpMethods />
      <Enforcements />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function TotpMethods() {
  const methods = useTotpMethods();
  const create = useCreateTotpMethod();
  const del = useDeleteTotpMethod();
  const [open, setOpen] = React.useState(false);
  const [issuer, setIssuer] = React.useState("OpenBao");
  const [period, setPeriod] = React.useState("30");
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<{ id: string; name: string } | null>(null);

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-4" /> TOTP methods
        </h2>
        <Button size="sm" onClick={() => { setCreated(null); setError(null); setOpen(true); }}>
          <Plus /> New method
        </Button>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Time-based one-time-password methods that can be enforced at login.
      </p>

      <ul className="divide-y rounded-md border">
        {(methods.data ?? []).map((mth) => (
          <li key={mth.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="font-medium">{mth.issuer || "TOTP"}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
              {mth.id}
            </span>
            <CopyButton value={mth.id} />
            <Button variant="ghost" size="icon" title="Delete" onClick={() => setRemoving({ id: mth.id, name: mth.issuer || "TOTP" })}>
              <Trash2 />
            </Button>
          </li>
        ))}
        {methods.isError ? <li className="p-3"><QueryError error={methods.error} what="TOTP methods" /></li> : methods.data?.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">No TOTP methods yet.</li>
        ) : null}
      </ul>

      {open ? (
        <Dialog open onClose={() => setOpen(false)}>
          <DialogHeader title="New TOTP method" onClose={() => setOpen(false)} />
          {created ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Method created. ID:</p>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
                <code className="min-w-0 flex-1 truncate text-sm">{created}</code>
                <CopyButton value={created} />
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setOpen(false)}>Done</Button>
              </div>
            </div>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                try {
                  const res = await create.mutateAsync({
                    issuer: issuer.trim() || "OpenBao",
                    period: Number(period) || 30,
                  });
                  setCreated(res.method_id);
                } catch (err) {
                  setError(errMsg(err));
                }
              }}
            >
              <Field label="Issuer"><Input value={issuer} onChange={(e) => setIssuer(e.target.value)} /></Field>
              <Field label="Period (seconds)"><Input value={period} onChange={(e) => setPeriod(e.target.value)} /></Field>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <DialogCancel onClose={() => setOpen(false)} />
                <Button type="submit" disabled={create.isPending}>Create</Button>
              </div>
            </form>
          )}
        </Dialog>
      ) : null}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          await del.mutateAsync(removing!.id);
          setRemoving(null);
        }}
        title={`Delete TOTP method "${removing?.name}"?`}
        description="Login enforcements using this method may stop working."
        confirmLabel="Delete"
        pending={del.isPending}
        error={del.error ? errMsg(del.error) : null}
      />
    </section>
  );
}

function Enforcements() {
  const list = useLoginEnforcements();
  const methods = useTotpMethods();
  const auth = useAuthMethods();
  const create = useCreateLoginEnforcement();
  const del = useDeleteLoginEnforcement();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [methodId, setMethodId] = React.useState("");
  const [accessor, setAccessor] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<string | null>(null);

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Login enforcements</h2>
        <Button size="sm" variant="outline" onClick={() => { setName(""); setMethodId(""); setAccessor(""); setError(null); setOpen(true); }}>
          <Plus /> New enforcement
        </Button>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Require an MFA method when logging in via a chosen auth mount.
      </p>

      <ul className="divide-y rounded-md border">
        {(list.data ?? []).map((n) => (
          <li key={n} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="font-mono">{n}</span>
            <Button variant="ghost" size="icon" title="Delete" onClick={() => setRemoving(n)}>
              <Trash2 />
            </Button>
          </li>
        ))}
        {list.isError ? <li className="p-3"><QueryError error={list.error} what="login enforcements" /></li> : list.data?.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">No enforcements yet.</li>
        ) : null}
      </ul>

      {open ? (
        <Dialog open onClose={() => setOpen(false)}>
          <DialogHeader title="New login enforcement" onClose={() => setOpen(false)} />
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              if (!name.trim()) return setError("Name is required");
              if (!methodId) return setError("Select an MFA method");
              if (!accessor) return setError("Select an auth mount");
              try {
                await create.mutateAsync({
                  name: name.trim(),
                  mfa_method_ids: [methodId],
                  auth_method_accessors: [accessor],
                });
                setOpen(false);
              } catch (err) {
                setError(errMsg(err));
              }
            }}
          >
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" autoFocus /></Field>
            <Field label="MFA method">
              <select value={methodId} onChange={(e) => setMethodId(e.target.value)} className="h-9 rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">— select —</option>
                {(methods.data ?? []).map((mth) => (
                  <option key={mth.id} value={mth.id}>{mth.issuer || "TOTP"} ({mth.id.slice(0, 8)}…)</option>
                ))}
              </select>
            </Field>
            <Field label="Apply to auth mount (accessor)">
              <select value={accessor} onChange={(e) => setAccessor(e.target.value)} className="h-9 rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">— select —</option>
                {(auth.data ?? []).filter((a) => a.path !== "token/").map((a) => (
                  <option key={a.path} value={a.accessor}>{a.path} ({a.type})</option>
                ))}
              </select>
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <DialogCancel onClose={() => setOpen(false)} />
              <Button type="submit" disabled={create.isPending || !accessor}>Create</Button>
            </div>
          </form>
        </Dialog>
      ) : null}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          await del.mutateAsync(removing!);
          setRemoving(null);
        }}
        title={`Delete enforcement "${removing}"?`}
        confirmText={removing ?? undefined}
        confirmLabel="Delete"
        pending={del.isPending}
        error={del.error ? errMsg(del.error) : null}
      />
    </section>
  );
}
