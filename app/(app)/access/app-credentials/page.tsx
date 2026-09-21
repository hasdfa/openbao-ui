"use client";

import { KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { CredRow, IssueCredentialDialog } from "@/components/issue-credential-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import {
  useAppCredentials,
  useRevokeAppCredential,
  useRotateSecretId,
  type AppCredential,
} from "@/lib/app-credentials";

const credKey = (c: AppCredential) => c.app + "::" + JSON.stringify(c.env);

export default function AppCredentialsPage() {
  const creds = useAppCredentials();
  const revoke = useRevokeAppCredential();
  const [issuing, setIssuing] = React.useState(false);
  const [rotating, setRotating] = React.useState<AppCredential | null>(null);
  const [revoking, setRevoking] = React.useState<AppCredential | null>(null);
  const list = creds.data ?? [];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <p className="mb-5 text-sm text-muted-foreground">
        App credentials are <strong>AppRole</strong> machine identities — a service logs in
        with a <code>role_id</code> + <code>secret_id</code> to get a short-lived, scoped
        token. One credential is created <strong>per environment</strong> for isolation.
      </p>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4 text-muted-foreground" /> Issued credentials
        </h2>
        <Button size="sm" onClick={() => setIssuing(true)}>
          <Plus /> Issue credential
        </Button>
      </div>

      {list.length ? (
        <ul className="divide-y rounded-md border">
          {list.map((c) => (
            <li key={credKey(c)} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="font-mono font-medium">{c.app}</span>
              <Badge variant="muted">{c.level === "viewer" ? "read-only" : "read/write"}</Badge>
              <span className="truncate text-xs text-muted-foreground">
                {c.roles.length} env{c.roles.length === 1 ? "" : "s"}: {c.roles.map((r) => r.env).join(", ")}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" title="Generate a fresh secret_id" onClick={() => setRotating(c)}>
                  <RefreshCw /> Rotate
                </Button>
                <Button variant="ghost" size="icon" title="Revoke" onClick={() => { revoke.reset(); setRevoking(c); }}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={KeyRound}
          title="No app credentials yet"
          description="Issue a credential to give a service its own scoped, short-lived token (instead of a human/root token)."
        />
      )}

      {issuing ? (
        <IssueCredentialDialog existing={list} onClose={() => setIssuing(false)} />
      ) : null}
      {rotating ? <RotateDialog cred={rotating} onClose={() => setRotating(null)} /> : null}

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await revoke.mutateAsync({ cred: revoking, existing: list });
            setRevoking(null);
          } catch {
            // Keep the dialog and definition available for retry; show the error below.
          }
        }}
        title="Revoke app credential"
        description={`Deletes the ${revoking?.roles.length ?? 0} AppRole(s) + policies for "${revoking?.app}". Any service still using them will stop receiving tokens.`}
        confirmLabel="Revoke"
        pending={revoke.isPending}
        error={revoke.error instanceof Error ? revoke.error.message : null}
      />
    </div>
  );
}

function RotateDialog({ cred, onClose }: { cred: AppCredential; onClose: () => void }) {
  const rotate = useRotateSecretId();
  const [results, setResults] = React.useState<{ env: string; role: string; secretId: string }[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const ran = React.useRef(false);

  React.useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const out: { env: string; role: string; secretId: string }[] = [];
        for (const r of cred.roles) {
          const sid = await rotate.mutateAsync({ mount: cred.mount, role: r.role });
          out.push({ env: r.env, role: r.role, secretId: sid });
        }
        setResults(out);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to rotate");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog open onClose={onClose} className="max-w-xl">
      <DialogHeader
        title={`Rotate secret_id — ${cred.app}`}
        description="A fresh secret_id per environment, shown once. Update your services, then the old one can be removed."
        onClose={onClose}
      />
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !results ? (
        <p className="text-sm text-muted-foreground">Rotating…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {results.map((r) => (
            <div key={r.role} className="rounded-md border p-3">
              <div className="mb-1 text-sm font-medium">
                {r.env} <span className="font-mono text-xs text-muted-foreground">({r.role})</span>
              </div>
              <CredRow label="secret_id" value={r.secretId} />
            </div>
          ))}
          <div className="flex justify-end border-t pt-3">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
