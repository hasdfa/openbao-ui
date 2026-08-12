"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BaoError } from "@/lib/bao-client";
import {
  useCorsConfig,
  useLoggers,
  useResetLoggers,
  useSanitizedConfig,
  useSetCorsConfig,
  useSetLogLevel,
} from "@/lib/settings";
import { useSealStatus } from "@/lib/system";

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : "Something went wrong";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-mono">{value || "—"}</dd>
    </>
  );
}

export default function ServerPage() {
  const cfg = useSanitizedConfig();
  const seal = useSealStatus();
  const c = (cfg.data ?? {}) as Record<string, unknown>;
  const storage = c.storage as { type?: string } | undefined;
  const listeners = (c.listeners as { config?: { address?: string } }[] | undefined) ?? [];

  return (
    <div className="mx-auto max-w-3xl p-8">
      <section className="rounded-xl border p-6">
        <h2 className="mb-3 text-sm font-medium">Server</h2>
        {cfg.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : cfg.isError ? (
          <p className="text-sm text-destructive">Could not read server config.</p>
        ) : (
          <>
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <Row label="Version" value={seal.data?.version} />
              <Row label="Seal type" value={seal.data?.type} />
              <Row label="Cluster" value={(c.cluster_name as string) || seal.data?.cluster_name} />
              <Row label="Storage" value={storage?.type} />
              <Row label="Listeners" value={listeners.map((l) => l.config?.address).filter(Boolean).join(", ")} />
              <Row label="Default lease TTL" value={String(c.default_lease_ttl ?? "")} />
              <Row label="Max lease TTL" value={String(c.max_lease_ttl ?? "")} />
              <Row label="API address" value={(c.api_addr as string) || ""} />
            </dl>
            <Disclosure label="Raw configuration" className="mt-4">
              <pre className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-3 text-xs">
                {JSON.stringify(cfg.data, null, 2)}
              </pre>
            </Disclosure>
          </>
        )}
      </section>

      <LoggingCard />
      <CorsCard />
    </div>
  );
}

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error"];

function LoggingCard() {
  const loggers = useLoggers();
  const setLevel = useSetLogLevel();
  const reset = useResetLoggers();
  // the "core" logger (or the first one) reflects the effective global level
  const current =
    loggers.data?.core ?? Object.values(loggers.data ?? {})[0] ?? "info";
  const [level, setLevel2] = React.useState("info");
  React.useEffect(() => setLevel2(current), [current]);

  return (
    <section className="mt-4 rounded-xl border p-6">
      <h2 className="mb-1 text-sm font-medium">Logging</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Adjust the server log level at runtime. Not persisted — reverts to the
        configured level on restart.
      </p>
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Level</span>
          <SelectField
            onValueChange={setLevel2}
            options={LOG_LEVELS.map((logLevel) => ({ value: logLevel, label: logLevel }))}
            value={level}
          />
        </div>
        <Button size="sm" onClick={() => setLevel.mutate(level)} disabled={setLevel.isPending}>
          Apply
        </Button>
        <Button size="sm" variant="outline" onClick={() => reset.mutate()} disabled={reset.isPending}>
          Reset
        </Button>
      </div>
    </section>
  );
}

function CorsCard() {
  const cors = useCorsConfig();
  const save = useSetCorsConfig();
  const [enabled, setEnabled] = React.useState(false);
  const [origins, setOrigins] = React.useState("");
  const [headers, setHeaders] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (cors.data) {
      setEnabled(cors.data.enabled);
      setOrigins(cors.data.allowed_origins.join(", "));
      setHeaders(cors.data.allowed_headers.join(", "));
    }
  }, [cors.data]);

  const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  return (
    <section className="mt-4 rounded-xl border p-6">
      <h2 className="mb-1 text-sm font-medium">CORS</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Allow browser clients from other origins to call the API directly.
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setSaved(false);
          try {
            await save.mutateAsync({
              enabled,
              allowed_origins: toList(origins),
              allowed_headers: toList(headers),
            });
            setSaved(true);
          } catch (err) {
            setError(errMsg(err));
          }
        }}
      >
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable CORS
        </label>
        <div className="flex flex-col gap-2">
          <Label>Allowed origins (comma-separated)</Label>
          <Input value={origins} onChange={(e) => setOrigins(e.target.value)} className="font-mono" placeholder="https://app.example.com or *" disabled={!enabled} />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Allowed headers (comma-separated)</Label>
          <Input value={headers} onChange={(e) => setHeaders(e.target.value)} className="font-mono" placeholder="X-Custom-Header" disabled={!enabled} />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save CORS"}
          </Button>
          {saved ? <span className="text-xs text-emerald-600">Saved</span> : null}
        </div>
      </form>
    </section>
  );
}
