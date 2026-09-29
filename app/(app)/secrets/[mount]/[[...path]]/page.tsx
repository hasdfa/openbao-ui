"use client";

import { useParams, useRouter } from "next/navigation";
import * as React from "react";

import { CubbyholeDashboard } from "@/components/engines/cubbyhole-dashboard";
import { DatabaseDashboard } from "@/components/engines/database-dashboard";
import { PkiDashboard } from "@/components/engines/pki-dashboard";
import { SshDashboard } from "@/components/engines/ssh-dashboard";
import { TransitDashboard } from "@/components/engines/transit-dashboard";
import { KvBrowser } from "@/components/kv/kv-browser";
import { useMounts } from "@/lib/kv";
import { safeDecode } from "@/lib/secrets-href";

function Redirect({ to }: { to: string }) {
  const router = useRouter();
  React.useEffect(() => {
    router.replace(to);
  }, [router, to]);
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Redirecting…
    </div>
  );
}

export default function MountPage() {
  const params = useParams<{ mount: string; path?: string[] }>();
  const all = [
    safeDecode(params.mount),
    ...(params.path ?? []).map(safeDecode),
  ];

  const mounts = useMounts();

  // Mounts can live at nested paths (e.g. "team/kv/"), but the route only
  // captures a single [mount] segment. Resolve the real mount as the longest
  // known mount path that prefixes the URL segments; the rest is the secret path.
  const { mount, segments } = React.useMemo(() => {
    const keys = Object.keys(mounts.data ?? {});
    let best = "";
    for (const k of keys) {
      const m = k.replace(/\/$/, "");
      const segs = m.split("/");
      if (segs.every((s, i) => all[i] === s) && m.length > best.length) best = m;
    }
    if (best) {
      return { mount: best, segments: all.slice(best.split("/").length) };
    }
    return { mount: all[0], segments: all.slice(1) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounts.data, params.mount, (params.path ?? []).join("/")]);

  const info = mounts.data?.[`${mount}/`];
  const type = info?.type;

  if (mounts.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const wrap = (node: React.ReactNode) => <div className="h-full">{node}</div>;

  // these are managed in their own sections rather than browsed as secrets
  if (type === "identity") return <Redirect to="/access/identity" />;
  if (type === "system") return <Redirect to="/operations" />;

  if (type === "transit") return wrap(<TransitDashboard mount={mount} />);
  if (type === "pki") return wrap(<PkiDashboard mount={mount} />);
  if (type === "ssh") return wrap(<SshDashboard mount={mount} />);
  if (type === "database") return wrap(<DatabaseDashboard mount={mount} />);
  if (type === "cubbyhole") return wrap(<CubbyholeDashboard segments={segments} />);

  // kv/generic, or an unknown type reached by a deep link -> assume KV
  if (!type || type === "kv" || type === "generic") {
    return wrap(<KvBrowser mount={mount} segments={segments} />);
  }

  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      <div>
        <p className="font-mono text-foreground">{mount}/</p>
        <p>A dashboard for <span className="font-mono">{type}</span> engines is coming soon.</p>
      </div>
    </div>
  );
}
