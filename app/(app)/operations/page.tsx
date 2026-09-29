"use client";

import { Lock, RotateCcw, Server, Unlock } from "lucide-react";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import {
  useHealth,
  useKeyStatus,
  useLeader,
  useRaftConfig,
  useRotateKey,
  useSeal,
} from "@/lib/operations";

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border p-5">
      <div className="mb-1 text-sm font-medium text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function StatusPage() {
  const health = useHealth();
  const leader = useLeader();
  const keyStatus = useKeyStatus();
  const raft = useRaftConfig();
  const rotate = useRotateKey();
  const seal = useSeal();
  const [confirmSeal, setConfirmSeal] = React.useState(false);
  const [confirmRotate, setConfirmRotate] = React.useState(false);

  const sealed = health.data?.sealed;

  return (
    <div className="max-w-5xl px-4 py-6 md:px-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Seal status"
          value={
            <span className="flex items-center gap-2">
              {sealed ? <Lock className="size-5 text-destructive" /> : <Unlock className="size-5 text-emerald-500" />}
              {health.isLoading ? "…" : sealed ? "Sealed" : "Unsealed"}
            </span>
          }
          hint={health.data ? `v${health.data.version}` : undefined}
        />
        <Stat
          label="Mode"
          value={health.data?.standby ? "Standby" : "Active"}
          hint={leader.data?.ha_enabled ? "HA enabled" : "HA disabled"}
        />
        <Stat
          label="Initialized"
          value={health.data ? (health.data.initialized ? "Yes" : "No") : "…"}
          hint={health.data?.cluster_name}
        />
        <Stat
          label="Key term"
          value={keyStatus.data?.term ?? "…"}
          hint={keyStatus.data ? `installed ${new Date(keyStatus.data.install_time).toLocaleDateString()}` : undefined}
        />
        <Stat
          label="Leader"
          value={leader.data?.is_self ? "This node" : leader.data?.leader_address ? "Remote" : "—"}
          hint={leader.data?.leader_address || undefined}
        />
        <Stat
          label="Storage"
          value={raft.data ? "Raft" : "Non-raft"}
          hint={raft.data ? `${raft.data.servers.length} peer(s)` : "no raft cluster"}
        />
      </div>

      {raft.data ? (
        <div className="mt-4">
          <Disclosure label="Raft peers" count={raft.data.servers.length}>
            <ul className="divide-y text-sm">
              {raft.data.servers.map((s) => (
                <li key={s.node_id} className="flex items-center gap-3 py-2">
                  <Server className="size-4 text-muted-foreground" />
                  <span className="font-mono">{s.node_id}</span>
                  <span className="text-muted-foreground">{s.address}</span>
                  {s.leader ? <span className="text-xs text-emerald-600">leader</span> : null}
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
      ) : null}

      {/* maintenance actions */}
      <div className="mt-6 rounded-xl border p-5">
        <h2 className="mb-1 text-sm font-medium">Maintenance</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Operator actions on the running instance.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirmRotate(true)} disabled={rotate.isPending}>
            <RotateCcw /> Rotate encryption key
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setConfirmSeal(true)}>
            <Lock /> Seal OpenBao
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        onConfirm={async () => { await rotate.mutateAsync(); setConfirmRotate(false); }}
        title="Rotate encryption key?"
        description="This changes the active encryption key and cannot be undone."
        destructive={false}
        confirmLabel="Rotate key"
        pending={rotate.isPending}
        error={rotate.error instanceof Error ? rotate.error.message : null}
      />

      <ConfirmDialog
        open={confirmSeal}
        onClose={() => setConfirmSeal(false)}
        onConfirm={async () => {
          await seal.mutateAsync();
          setConfirmSeal(false);
        }}
        title="Seal OpenBao?"
        description="Sealing takes the instance offline until it is unsealed again with the unseal keys. The UI will stop working until then."
        confirmText="seal"
        confirmLabel="Seal now"
        pending={seal.isPending}
      />
    </div>
  );
}
