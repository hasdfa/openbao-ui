"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { ColorDot } from "@/components/label-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EnvironmentItem = {
  path: string; // trailing slash, e.g. "secret/"
  mount: string;
  type: string;
  version?: string;
  title: string;
  color: string | null;
};

const iconBtn =
  "size-11 shrink-0 text-muted-foreground md:size-9";

export function EnvironmentRail({
  envs,
  canManage,
  onCreate,
  onEdit,
  onDelete,
}: {
  envs: EnvironmentItem[];
  canManage: boolean;
  onCreate: () => void;
  onEdit: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Environments</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            KV mounts. Apps are folders inside them.
          </p>
        </div>
        {canManage ? (
          <Button size="sm" onClick={onCreate}>
            <Plus /> New environment
          </Button>
        ) : null}
      </div>
      {envs.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
          No environments yet. Create one to start grouping app secrets.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {envs.map((env) => (
            <li
              key={env.path}
              className="flex min-w-[14rem] flex-1 items-center gap-1 rounded-lg border bg-card px-2 py-1.5 sm:max-w-sm"
            >
              <Link
                href={`/secrets/${env.mount}`}
                className="min-w-0 flex-1 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-accent"
              >
                <div className="flex items-center gap-2">
                  <ColorDot color={env.color} className="size-2.5 shrink-0" />
                  <span
                    className={cn(
                      "truncate text-sm",
                      env.title !== env.path ? "font-medium" : "font-mono font-medium",
                    )}
                  >
                    {env.title}
                  </span>
                  <Badge variant="muted">
                    {env.type}
                    {env.version ? ` v${env.version}` : ""}
                  </Badge>
                </div>
                {env.title !== env.path ? (
                  <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                    {env.path}
                  </div>
                ) : null}
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={iconBtn}
                title="Customize display"
                aria-label={`Customize ${env.path}`}
                onClick={() => onEdit(env.path)}
              >
                <Pencil />
              </Button>
              {canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(iconBtn, "hover:text-destructive")}
                  title="Disable environment"
                  aria-label={`Disable ${env.path}`}
                  onClick={() => onDelete(env.path)}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
