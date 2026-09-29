"use client";

import { RefreshCw } from "lucide-react";
import * as React from "react";

import { LogoutButton } from "@/components/logout-button";
import { useRenew, useSession } from "@/lib/auth-hooks";
import { toLogin } from "@/lib/login-redirect";

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function SessionBar({ displayName }: { displayName: string }) {
  const { data } = useSession();
  const renew = useRenew();
  const ttl = data?.ttl ?? 0;
  const renewable = data?.renewable ?? false;

  // local countdown anchored to the last fetched ttl
  const [remaining, setRemaining] = React.useState(ttl);
  React.useEffect(() => setRemaining(ttl), [ttl]);
  // Set by the ticker, so a freshly loaded ttl (state still 0 for one render)
  // is never mistaken for a countdown that ran out.
  const ticked = React.useRef(false);
  React.useEffect(() => {
    if (ttl <= 0) return; // non-expiring (e.g. root)
    const id = setInterval(() => {
      ticked.current = true;
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [ttl]);

  // The countdown hitting zero means the token is dead: sign in again.
  React.useEffect(() => {
    if (ttl > 0 && remaining === 0 && ticked.current) toLogin();
  }, [ttl, remaining]);

  const name = data?.displayName || displayName;
  const expiring = ttl > 0;

  return (
    <div className="border-t p-3">
      <div className="px-3 py-2 text-xs text-muted-foreground">
        Signed in as
        <div className="truncate font-medium text-foreground">{name}</div>
        <div className="mt-1 flex items-center gap-2">
          {/* ticks every second: fixed-width digits keep the line from jittering */}
          <span className="tabular-nums">{expiring ? (remaining > 0 ? `expires in ${fmt(remaining)}` : "expired") : "never expires"}</span>
          {expiring && renewable ? (
            <button
              type="button"
              onClick={() => renew.mutate()}
              disabled={renew.isPending}
              title="Renew token"
              aria-label="Renew token"
              className="-m-1 inline-flex size-6 items-center justify-center rounded text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <RefreshCw className={`size-3 ${renew.isPending ? "animate-spin" : ""}`} />
            </button>
          ) : null}
        </div>
      </div>
      <LogoutButton />
    </div>
  );
}
