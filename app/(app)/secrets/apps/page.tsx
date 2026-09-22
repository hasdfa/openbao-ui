"use client";

import { ArrowLeft, KeyRound, Package, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { GrantAccessDialog } from "@/components/grant-access-dialog";
import { IssueCredentialDialog } from "@/components/issue-credential-dialog";
import { ColorDot, LabelEditor } from "@/components/label-editor";
import { NewAppDialog } from "@/components/new-app-dialog";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccessRoles } from "@/lib/access-roles";
import { useProjectCredentials } from "@/lib/project-credentials";
import { useApps, useDeleteApp, type AppInfo } from "@/lib/apps";
import { labelKey, useLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

export default function AppsPage() {
  const { apps, isLoading, kvMounts } = useApps();
  const { data: labels } = useLabels();
  const accessRoles = useAccessRoles();
  const appCreds = useProjectCredentials();
  const remove = useDeleteApp();
  const envName = (m: string) => labels?.[labelKey("environment", `${m}/`)]?.label || m;

  const [creating, setCreating] = React.useState(false);
  const [issuing, setIssuing] = React.useState<string | null>(null);
  const [granting, setGranting] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<AppInfo | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Package className="size-6" /> Apps
          </span>
        }
        description="Your applications — folders of secrets across environments. Issue credentials or grant access per app."
        className="mb-6"
        actions={
          <>
            <Link href="/secrets">
              <Button variant="outline" size="sm">
                <ArrowLeft /> Secrets
              </Button>
            </Link>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> New app
            </Button>
          </>
        }
      />

      {isLoading ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="rounded-xl border bg-card p-4 shadow-sm">
              <Skeleton className="mb-3 h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </li>
          ))}
        </ul>
      ) : apps.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No apps yet"
          description="Apps are top-level folders inside your environments (e.g. payments/). Add one, or create a secret under a new folder."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {apps.map((a) => (
            <li
              key={a.app}
              className="flex flex-col gap-3 rounded-xl border bg-card p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Package className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {a.label?.color ? <ColorDot color={a.label.color} className="size-2.5 shrink-0" /> : null}
                    <span className="font-medium">{a.label?.label || a.app}</span>
                    {a.label?.label ? <Badge variant="muted" className="font-mono">{a.app}</Badge> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {a.label?.description || `${a.envs.length || "no"} environment${a.envs.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="flex shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 text-muted-foreground md:size-9"
                    title="Edit app"
                    aria-label={`Edit ${a.app}`}
                    onClick={() => setEditing(a.app)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 text-muted-foreground hover:text-destructive md:size-9"
                    title="Delete app"
                    aria-label={`Delete ${a.app}`}
                    onClick={() => {
                      setDeleteError(null);
                      setDeleting(a);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {kvMounts.map((env) => (
                  <Badge
                    key={env.mount}
                    variant={a.envs.includes(env.mount) ? "outline" : "muted"}
                  >
                    {envName(env.mount)}
                    {a.envs.includes(env.mount) ? "" : " — missing"}
                  </Badge>
                ))}
                {kvMounts.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No environments</span>
                ) : null}
              </div>

              <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
                <Button size="sm" variant="outline" onClick={() => setIssuing(a.app)}>
                  <KeyRound /> Issue credential
                </Button>
                <Button size="sm" variant="outline" onClick={() => setGranting(a.app)}>
                  <ShieldCheck /> Grant access
                </Button>
                {a.envs[0] ? (
                  <Link
                    href={`/secrets/${a.envs[0]}/${a.app}`}
                    className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "ml-auto")}
                  >
                    Open
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating ? <NewAppDialog onClose={() => setCreating(false)} /> : null}
      {issuing ? (
        <IssueCredentialDialog existing={appCreds.data ?? []} initialApp={issuing} onClose={() => setIssuing(null)} />
      ) : null}
      {granting ? (
        <GrantAccessDialog existing={accessRoles.data ?? []} initialApp={granting} onClose={() => setGranting(null)} />
      ) : null}
      {editing ? (
        <LabelEditor
          open
          onClose={() => setEditing(null)}
          scope="project"
          refPath={editing}
          current={labels?.[labelKey("project", editing)]}
          nativeName={editing}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setDeleteError(null);
          try {
            await remove.mutateAsync({
              app: deleting.app,
              envs: kvMounts.filter((env) => deleting.envs.includes(env.mount)),
            });
            setDeleting(null);
          } catch (err) {
            setDeleteError(err instanceof Error ? err.message : "Failed to delete app");
          }
        }}
        title="Delete app"
        description={`Permanently deletes every secret under "${deleting?.app}/" in ${
          deleting?.envs.length ? deleting.envs.map(envName).join(", ") : "no environments"
        }, then unregisters the app.`}
        confirmText={deleting?.app}
        confirmLabel="Delete app"
        pending={remove.isPending}
        error={deleteError}
      />
    </div>
  );
}
