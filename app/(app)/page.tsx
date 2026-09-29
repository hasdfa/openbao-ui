"use client";

import {
  ChevronRight,
  KeyRound,
  Lock,
  ShieldCheck,
  Unlock,
  Users,
} from "lucide-react";
import Link from "next/link";

import { GettingStarted } from "@/components/getting-started";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { Skeleton } from "@/components/ui/skeleton";
import { useResultantAcl } from "@/lib/acl";
import { useAuthMethods } from "@/lib/auth-methods";
import { useSession } from "@/lib/auth-hooks";
import { usePolicies } from "@/lib/access";
import { useMounts } from "@/lib/kv";
import { useSealStatus } from "@/lib/system";

export default function OverviewPage() {
  const seal = useSealStatus();
  const session = useSession();
  const mounts = useMounts();
  const auth = useAuthMethods();
  const policies = usePolicies();
  const acl = useResultantAcl();

  const sealed = seal.data?.sealed;

  return (
    <div className="mx-auto max-w-5xl p-8">
      <PageHeader
        title="Overview"
        description="Your OpenBao at a glance."
        className="mb-6"
      />

      <GettingStarted />

      {/* hero: the two things you check first */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Status
            </span>
            <div
              className={
                "flex size-9 items-center justify-center rounded-lg " +
                (sealed ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600")
              }
            >
              {sealed ? <Lock className="size-4" /> : <Unlock className="size-4" />}
            </div>
          </div>
          <div className="text-2xl font-semibold tracking-tight">
            {seal.isLoading
              ? "…"
              : seal.isError
                ? "Unreachable"
                : sealed
                  ? "Sealed"
                  : "Unsealed"}
          </div>
          {seal.data ? (
            <p className="text-xs text-muted-foreground">
              v{seal.data.version} · {seal.data.type}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Signed in as
            </span>
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-4" />
            </div>
          </div>
          <div className="truncate text-2xl font-semibold tracking-tight">
            {session.data?.displayName ?? "…"}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {(session.data?.policies ?? []).map((p) => (
              <Badge key={p}>{p}</Badge>
            ))}
          </div>
        </div>
      </div>

      {/* quick stats — each links you to the section */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Secret engines"
          icon={<KeyRound className="size-4" />}
          value={mounts.isError ? null : Object.keys(mounts.data ?? {}).length}
          href="/secrets"
          loading={mounts.isLoading}
        />
        <StatTile
          label="Auth methods"
          icon={<Users className="size-4" />}
          value={auth.isError ? null : (auth.data?.length ?? null)}
          href="/access/auth"
          loading={auth.isLoading}
        />
        <StatTile
          label="Policies"
          icon={<ShieldCheck className="size-4" />}
          value={policies.isError ? null : (policies.data?.length ?? null)}
          href="/access"
          loading={policies.isLoading}
        />
      </div>

      {/* depth on demand */}
      <div className="mt-4">
        <Disclosure label="System details">
          <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <Detail k="Version" v={seal.data?.version} />
            <Detail k="Seal type" v={seal.data?.type} />
            <Detail
              k="Initialized"
              v={seal.data ? String(seal.data.initialized) : undefined}
            />
            <Detail k="Cluster" v={seal.data?.cluster_name || "—"} />
            <Detail
              k="Token access"
              v={acl.data?.root ? "root (full access)" : "scoped by policy"}
            />
          </dl>
        </Disclosure>
      </div>
    </div>
  );
}

function StatTile({
  label,
  icon,
  value,
  href,
  loading,
}: {
  label: string;
  icon: React.ReactNode;
  value: number | null;
  href: string;
  loading: boolean;
}) {
  const denied = value === null && !loading;
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-[border-color,box-shadow] duration-150 ease-out hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.99]"
    >
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        {loading ? (
          <Skeleton className="h-8 w-10" />
        ) : (
          <div className="text-2xl font-semibold tabular-nums tracking-tight">
            {denied ? "—" : value}
          </div>
        )}
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
      <ChevronRight className="size-4 text-muted-foreground transition-transform duration-150 ease-out [@media(hover:hover)]:group-hover:translate-x-0.5" />
    </Link>
  );
}

function Detail({ k, v }: { k: string; v?: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-mono">{v ?? "—"}</dd>
    </>
  );
}
