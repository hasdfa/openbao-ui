"use client";

import { KeyRound, Package, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { ColorDot } from "@/components/label-editor";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { type AppInfo, type KvMount } from "@/lib/apps";
import { cn } from "@/lib/utils";

const iconBtn = "size-11 shrink-0 text-muted-foreground md:size-9";

export function AppsMatrix({
  apps,
  kvMounts,
  envName,
  envColor,
  seeding,
  onCreate,
  onEdit,
  onDelete,
  onSeed,
  onIssue,
  onGrant,
}: {
  apps: AppInfo[];
  kvMounts: KvMount[];
  envName: (mount: string) => string;
  envColor: (mount: string) => string | null;
  seeding: boolean;
  onCreate: () => void;
  onEdit: (app: string) => void;
  onDelete: (app: AppInfo) => void;
  onSeed: (app: string, env: KvMount) => void;
  onIssue: (app: string) => void;
  onGrant: (app: string) => void;
}) {
  if (kvMounts.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Create an environment first"
        description="Apps live as folders inside KV environments. Add production, staging, or similar, then register apps into them."
      />
    );
  }
  if (apps.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No apps yet"
        description="An app is a folder of secrets across environments — for example payments/ in prod and staging."
        action={
          <Button size="sm" onClick={onCreate}>
            <Plus /> New app
          </Button>
        }
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-4 py-2.5 font-medium">App</th>
            {kvMounts.map((env) => (
              <th key={env.mount} className="px-3 py-2.5 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <ColorDot color={envColor(env.mount)} className="size-2 shrink-0" />
                  {envName(env.mount)}
                </span>
              </th>
            ))}
            <th className="px-3 py-2.5 font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {apps.map((app) => (
            <tr key={app.app} className="border-b last:border-0">
              <td className="px-4 py-3 align-middle">
                <div className="flex items-start gap-2">
                  <ColorDot color={app.label?.color} className="mt-1.5 size-2.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{app.label?.label || app.app}</span>
                      {app.label?.label ? (
                        <Badge variant="muted" className="font-mono">{app.app}</Badge>
                      ) : null}
                    </div>
                    {app.label?.description ? (
                      <p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">
                        {app.label.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              </td>
              {kvMounts.map((env) => {
                const present = app.envs.includes(env.mount);
                return (
                  <td key={env.mount} className="px-3 py-3 align-middle">
                    {present ? (
                      <Link
                        href={`/secrets/${env.mount}/${app.app}`}
                        className={buttonVariants({ size: "sm", variant: "outline" })}
                      >
                        Open
                      </Link>
                    ) : env.v2 ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={seeding}
                        onClick={() => onSeed(app.app, env)}
                      >
                        <Plus /> Add
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">KV v1</span>
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-2 align-middle">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={iconBtn}
                    title="Issue credential"
                    aria-label={`Issue credential for ${app.app}`}
                    onClick={() => onIssue(app.app)}
                  >
                    <KeyRound />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={iconBtn}
                    title="Grant access"
                    aria-label={`Grant access to ${app.app}`}
                    onClick={() => onGrant(app.app)}
                  >
                    <ShieldCheck />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={iconBtn}
                    title="Edit app"
                    aria-label={`Edit ${app.app}`}
                    onClick={() => onEdit(app.app)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(iconBtn, "hover:text-destructive")}
                    title="Delete app"
                    aria-label={`Delete ${app.app}`}
                    onClick={() => onDelete(app)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
