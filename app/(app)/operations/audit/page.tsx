"use client";

import { FileText, Info } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BaoError } from "@/lib/bao-client";
import { useAuditLog } from "@/lib/audit-log";
import { useAuditDevices } from "@/lib/operations";

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : "Something went wrong";

export default function AuditPage() {
  const devices = useAuditDevices();
  const log = useAuditLog();
  const [filter, setFilter] = React.useState("");

  const records = (log.data?.records ?? []).filter((r) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      (r.path ?? "").toLowerCase().includes(q) ||
      (r.operation ?? "").toLowerCase().includes(q) ||
      (r.display_name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-4xl px-4 py-6 md:px-8">
      <p className="mb-3 text-sm text-muted-foreground">
        Audit devices record every request &amp; response for compliance.
      </p>

      <div className="mb-4 flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">
          OpenBao manages audit devices{" "}
          <span className="font-medium text-foreground">declaratively</span> via the server config
          (enabling over the API is disabled). The viewer below reads the configured file device.
        </span>
      </div>

      {/* configured devices */}
      <h2 className="mb-2 text-sm font-medium">Devices</h2>
      {devices.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : devices.isError ? (
        <p className="text-sm text-destructive">{errMsg(devices.error)}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {(devices.data ?? []).map((d) => (
            <li key={d.path} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <span className="font-mono">{d.path}</span>
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{d.type}</span>
                {d.options?.file_path ? (
                  <div className="truncate font-mono text-xs text-muted-foreground">{d.options.file_path}</div>
                ) : null}
              </div>
            </li>
          ))}
          {devices.data?.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No audit devices configured.</li>
          ) : null}
        </ul>
      )}

      {/* log viewer */}
      <div className="mt-8 mb-2 flex items-center justify-between">
        <h2 className="text-sm font-medium">Recent activity</h2>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter by path / operation / user…"
          className="h-8 max-w-xs"
        />
      </div>

      {log.data && !log.data.available ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No audit log file found. Configure a file audit device (see{" "}
          <span className="font-mono">docker/openbao.hcl</span>) to capture activity.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Op</th>
                  <th className="px-3 py-2.5 font-medium">Path</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((r, i) => (
                  <tr key={i} className={r.error ? "bg-destructive/5" : "transition-colors hover:bg-muted/40"}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">
                      {r.time ? new Date(r.time).toLocaleTimeString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={r.type === "response" ? "default" : "muted"}>{r.type}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.operation ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.path ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.remote_address ?? "—"}</td>
                  </tr>
                ))}
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                      {log.isLoading ? "Loading…" : "No matching events."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
