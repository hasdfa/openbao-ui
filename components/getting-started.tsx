"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, Circle, Rocket, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/acl";
import { useAuthMethods } from "@/lib/auth-methods";
import { baoFetch } from "@/lib/bao-client";
import { useGroupsDetailed } from "@/lib/identity";
import { useMounts } from "@/lib/kv";
import { useNamespace } from "@/lib/namespace";
import { useOnboarding, useSetOnboarding } from "@/lib/onboarding";

type Step = {
  id: string;
  title: string;
  description: string;
  href: string;
  action: string;
  done: boolean;
  onAction?: () => void;
};

// First-run guidance. Steps are derived from live OpenBao state where possible
// (so the list stays truthful and self-updates), with only the dismiss flag and
// the informational "connect" step persisted in the onboarding store.
export function GettingStarted() {
  const can = useCan();
  const { namespace } = useNamespace();
  const mounts = useMounts();
  const auth = useAuthMethods();
  const groups = useGroupsDetailed();
  const onboarding = useOnboarding();
  const setOnboarding = useSetOnboarding();

  const kvMounts = Object.entries(mounts.data ?? {})
    .filter(([, v]) => v.type === "kv" || v.type === "generic")
    .map(([p]) => p.replace(/\/$/, ""));

  const hasSecret = useQuery({
    queryKey: ["onboarding-has-secret", namespace, kvMounts],
    enabled: kvMounts.length > 0,
    queryFn: async () => {
      for (const m of kvMounts.slice(0, 3)) {
        try {
          const res = await baoFetch<{ data: { keys: string[] } }>({
            path: `${m}/metadata`,
            namespace,
            list: true,
          });
          if ((res.data?.keys ?? []).length) return true;
        } catch {
          // no keys / not permitted — keep checking
        }
      }
      return false;
    },
  });

  // Only operators can act on these steps — don't nag read-only users.
  if (!can("sys/mounts")) return null;
  // Wait for the stored state so we don't flash the card before a dismiss loads.
  if (onboarding.isLoading || onboarding.data?.dismissed) return null;

  const markConnect = () => setOnboarding.mutate({ steps: { connect: true } });

  const steps: Step[] = [
    {
      id: "signin",
      title: "Set up sign-in",
      description: "Let your team log in with Google (OIDC).",
      href: "/access/auth",
      action: "Set up Google",
      done: (auth.data ?? []).some((m) => m.type === "oidc"),
    },
    {
      id: "environment",
      title: "Create an environment",
      description: "Enable a KV secrets engine for dev / staging / prod.",
      href: "/secrets?new=1",
      action: "Create environment",
      done: kvMounts.length > 0,
    },
    {
      id: "secret",
      title: "Store your first secret",
      description: "Add a key/value secret your app can read.",
      href: "/secrets",
      action: "Add a secret",
      done: !!hasSecret.data,
    },
    {
      id: "team",
      title: "Invite your team",
      description: "Create roles and assign them to members.",
      href: "/access/team",
      action: "Open Team",
      done: (groups.data ?? []).some((g) => (g.member_entity_ids?.length ?? 0) > 0),
    },
    {
      id: "connect",
      title: "Connect your app",
      description: "Copy a ready-made snippet to read secrets from your code.",
      href: "/guides",
      action: "View guides",
      done: !!onboarding.data?.steps?.connect,
      onAction: markConnect,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null; // nothing left to guide

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-primary/30 bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b bg-primary/5 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Rocket className="size-4" />
          </div>
          <div>
            <div className="font-semibold">Getting started</div>
            <div className="text-xs text-muted-foreground">
              {doneCount} of {steps.length} complete
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOnboarding.mutate({ dismissed: true })}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Dismiss getting started"
          title="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="h-1 w-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${(doneCount / steps.length) * 100}%` }}
        />
      </div>

      <ul className="divide-y">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-5 py-3">
            {s.done ? (
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
            ) : (
              <Circle className="size-5 shrink-0 text-muted-foreground/40" />
            )}
            <div className="min-w-0 flex-1">
              <div className={s.done ? "text-sm font-medium text-muted-foreground line-through" : "text-sm font-medium"}>
                {s.title}
              </div>
              <div className="truncate text-xs text-muted-foreground">{s.description}</div>
            </div>
            {!s.done ? (
              <Link href={s.href} onClick={s.onAction}>
                <Button size="sm" variant="outline">
                  {s.action} <ArrowRight />
                </Button>
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
