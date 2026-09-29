"use client";

import { Gauge, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogCancel } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaoError, baoFetch } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";
import {
  useCreateRateLimitQuota,
  useDeleteRateLimitQuota,
  useRateLimitQuotas,
} from "@/lib/operations";

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : "Something went wrong";

export default function QuotasPage() {
  const quotas = useRateLimitQuotas();
  const create = useCreateRateLimitQuota();
  const del = useDeleteRateLimitQuota();
  const { namespace } = useNamespace();
  const [open, setOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [rate, setRate] = React.useState("1000");
  const [interval, setInterval] = React.useState("1s");
  const [path, setPath] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="max-w-3xl px-4 py-6 md:px-8">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Rate-limit quotas cap requests per interval, optionally scoped to a path.
        </p>
        <Button size="sm" onClick={() => { setError(null); setOpen(true); }}>
          <Plus /> New quota
        </Button>
      </div>

      <ul className="divide-y rounded-md border">
        {(quotas.data ?? []).map((q) => (
          <li key={q} className="flex items-center gap-3 px-3 py-2 text-sm">
            <Gauge className="size-4 text-muted-foreground" />
            <span className="flex-1 font-mono">{q}</span>
            <Button variant="ghost" size="icon" title="Delete" onClick={() => setRemoving(q)}><Trash2 /></Button>
          </li>
        ))}
        {quotas.isError ? <li className="p-3"><QueryError error={quotas.error} what="rate-limit quotas" /></li> : quotas.data?.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">No rate-limit quotas.</li>
        ) : null}
      </ul>

      {open ? (
        <Dialog open onClose={() => setOpen(false)}>
          <DialogHeader title="New rate-limit quota" onClose={() => setOpen(false)} />
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              if (!name.trim()) return setError("Name is required");
              try {
                try {
                  await baoFetch({ path: `sys/quotas/rate-limit/${name.trim()}`, namespace });
                  return setError(`A quota named ${name.trim()} already exists`);
                } catch (err) {
                  if (!(err instanceof BaoError && err.status === 404)) throw err;
                }
                await create.mutateAsync({
                  name: name.trim(),
                  rate: Number(rate) || 0,
                  interval,
                  path: path.trim() || undefined,
                });
                setOpen(false);
                setName(""); setPath("");
              } catch (err) {
                setError(errMsg(err));
              }
            }}
          >
            <div className="flex flex-col gap-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" autoFocus />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-2">
                <Label>Rate (req)</Label>
                <Input value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label>Interval</Label>
                <Input value={interval} onChange={(e) => setInterval(e.target.value)} placeholder="1s, 1m…" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Path (optional)</Label>
              <Input value={path} onChange={(e) => setPath(e.target.value)} className="font-mono" placeholder="secret/" />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <DialogCancel onClose={() => setOpen(false)} />
              <Button type="submit" disabled={create.isPending}>Create</Button>
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
        title={`Delete quota "${removing}"?`}
        confirmLabel="Delete"
        pending={del.isPending}
        error={del.error ? errMsg(del.error) : null}
      />
    </div>
  );
}
