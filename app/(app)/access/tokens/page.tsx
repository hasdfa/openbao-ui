"use client";

import { KeyRound, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { BaoError } from "@/lib/bao-client";
import {
  TokenInfo,
  useCreateToken,
  useRevokeAccessor,
  useTokenRoles,
  useTokens,
} from "@/lib/access";

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : "Something went wrong";

const fmtTtl = (s: number) =>
  s <= 0 ? "∞" : s >= 3600 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 60)}m`;

export default function TokensPage() {
  const tokens = useTokens();
  const [creating, setCreating] = React.useState(false);
  const [revoking, setRevoking] = React.useState<TokenInfo | null>(null);
  const revoke = useRevokeAccessor();

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {tokens.data ? `${tokens.data.length} active token(s)` : " "}
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> Create token
        </Button>
      </div>

      {tokens.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading tokens…</p>
      ) : tokens.isError ? (
        <p className="text-sm text-destructive">{errMsg(tokens.error)}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Display name</th>
                <th className="px-4 py-2.5 font-medium">Policies</th>
                <th className="px-4 py-2.5 font-medium">TTL</th>
                <th className="px-4 py-2.5 font-medium">Accessor</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(tokens.data ?? []).map((t) => (
                <tr key={t.accessor} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-2.5 font-medium">
                    {t.display_name || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {t.policies.map((p) => (
                        <Badge key={p}>{p}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                    {fmtTtl(t.ttl)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {t.accessor.slice(0, 10)}…
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Revoke"
                      onClick={() => setRevoking(t)}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
              {tokens.data?.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    No tokens found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {creating ? (
        <CreateTokenDialog onClose={() => setCreating(false)} />
      ) : null}

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          await revoke.mutateAsync(revoking!.accessor);
          setRevoking(null);
        }}
        title="Revoke token?"
        description={`Revokes "${revoking?.display_name || revoking?.accessor}" and its leases immediately.`}
        confirmLabel="Revoke"
        pending={revoke.isPending}
      />
    </div>
  );
}

function CreateTokenDialog({ onClose }: { onClose: () => void }) {
  const roles = useTokenRoles();
  const create = useCreateToken();
  const [displayName, setDisplayName] = React.useState("");
  const [policies, setPolicies] = React.useState("");
  const [ttl, setTtl] = React.useState("");
  const [role, setRole] = React.useState("");
  const [renewable, setRenewable] = React.useState(true);
  const [noParent, setNoParent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    client_token: string;
    accessor: string;
  } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const auth = await create.mutateAsync({
        display_name: displayName || undefined,
        policies: policies
          ? policies.split(",").map((p) => p.trim()).filter(Boolean)
          : undefined,
        ttl: ttl || undefined,
        renewable,
        no_parent: noParent,
        role: role || undefined,
      });
      setResult({ client_token: auth.client_token, accessor: auth.accessor });
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <Dialog open onClose={onClose} className="max-w-lg">
      <DialogHeader title="Create token" onClose={onClose} />
      {result ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Copy the token now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
            <KeyRound className="size-4 shrink-0 text-muted-foreground" />
            <code className="min-w-0 flex-1 truncate text-sm">
              {result.client_token}
            </code>
            <CopyButton value={result.client_token} />
          </div>
          <div className="text-xs text-muted-foreground">
            accessor: <span className="font-mono">{result.accessor}</span>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-name">Display name</Label>
            <Input
              id="t-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="ci-deploy"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="t-policies">Policies (comma-separated)</Label>
            <Input
              id="t-policies"
              value={policies}
              onChange={(e) => setPolicies(e.target.value)}
              placeholder="default, my-app"
              className="font-mono"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="t-ttl">TTL</Label>
              <Input
                id="t-ttl"
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                placeholder="1h"
              />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="t-role">Role (optional)</Label>
              <SelectField
                id="t-role"
                onValueChange={setRole}
                options={[
                  { value: "", label: "— none —" },
                  ...(roles.data ?? []).map((item) => ({ value: item, label: item })),
                ]}
                value={role}
              />
            </div>
          </div>
          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={renewable}
                onChange={(e) => setRenewable(e.target.checked)}
              />
              Renewable
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={noParent}
                onChange={(e) => setNoParent(e.target.checked)}
              />
              Orphan (no parent)
            </label>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
