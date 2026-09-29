"use client";

import { RefreshCw, ShieldCheck } from "lucide-react";

import { LogoutButton } from "@/components/logout-button";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { useRenew } from "@/lib/auth-hooks";
import { useTokenSelf } from "@/lib/settings";

function fmtTtl(s: number) {
  if (s <= 0) return "∞ (never expires)";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

export default function ProfilePage() {
  const token = useTokenSelf();
  const renew = useRenew();
  const t = token.data;

  return (
    <div className="max-w-2xl px-4 py-6 md:px-8">
      {token.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !t ? (
        <p className="text-sm text-destructive">Could not load token details.</p>
      ) : (
        <div className="rounded-xl border p-6">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <div className="text-lg font-semibold">{t.display_name || "token"}</div>
                <div className="text-xs text-muted-foreground">
                  {t.expire_time ? `expires in ${fmtTtl(t.ttl)}` : "never expires"}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {t.renewable && t.ttl > 0 ? (
                <Button size="sm" variant="outline" onClick={() => renew.mutate()} disabled={renew.isPending}>
                  <RefreshCw className={renew.isPending ? "animate-spin" : ""} /> Renew
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mb-3">
            <div className="mb-1 text-sm text-muted-foreground">Policies</div>
            <div className="flex flex-wrap gap-1">
              {t.policies.map((p) => (
                <span key={p} className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground">{p}</span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
            <span className="text-xs text-muted-foreground">accessor</span>
            <code className="min-w-0 flex-1 truncate text-sm">{t.accessor}</code>
            <CopyButton value={t.accessor} />
          </div>

          <Disclosure label="Details" className="mt-4">
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <Row label="Entity ID">{t.entity_id || <span className="text-muted-foreground">none</span>}</Row>
              <Row label="Auth path"><span className="font-mono">{t.path}</span></Row>
              <Row label="Orphan">{String(t.orphan)}</Row>
              <Row label="Created">{new Date(t.creation_time * 1000).toLocaleString()}</Row>
              <Row label="Expires">{t.expire_time ? new Date(t.expire_time).toLocaleString() : "—"}</Row>
              <Row label="Renewable">{String(t.renewable)}</Row>
            </dl>
          </Disclosure>

          <div className="mt-4 border-t pt-4">
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}
