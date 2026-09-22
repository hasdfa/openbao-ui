"use client";

import { Check, ChevronDown, ChevronRight, Package } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { CopyButton } from "@/components/copy-button";
import { ColorDot } from "@/components/label-editor";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { cn } from "@/lib/utils";

export type EnvOption = {
  mount: string;
  v2: boolean;
  name: string; // friendly label, or the mount path when unlabeled
  labeled: boolean;
  color: string | null;
};

export type ProjectOption = {
  project: string; // folder name — the OpenBao truth
  name: string; // friendly label, or the folder name
  labeled: boolean;
  color: string | null;
};

/** What the current path looks like in one environment. */
export type EnvPresence = {
  count: number | null; // keys at this path, null while unknown
  loading: boolean;
  reachable: boolean; // false = listing failed for a reason other than 404
};

// A chevron, not a slash: these two chips read project-then-environment, which
// is the reverse of the path underneath. A "/" here would claim the path is
// "backend/production" when OpenBao stores "production/backend".
const sep = (
  <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/50" />
);

/**
 * The scope spine: project and environment read as switchable chips on the
 * first line, the literal OpenBao path underneath. You hold one project in your
 * head and hop between its environments, so the project leads — the same key in
 * staging is one click away, not a trip back through the index.
 */
export function KvScopeBar({
  mount,
  segments,
  envs,
  projects,
  presence,
  actions,
}: {
  mount: string;
  segments: string[];
  envs: EnvOption[];
  projects: ProjectOption[];
  presence: Record<string, EnvPresence>;
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const current = envs.find((e) => e.mount === mount);
  const projectSeg = segments[0];
  const projectOpt = projects.find((p) => p.project === projectSeg);
  const pathSegs = [mount, ...segments];
  const fullPath = pathSegs.join("/");

  const hrefFor = (m: string) => `/secrets/${[m, ...segments].join("/")}`;

  return (
    <div className="px-4 py-3 md:px-6">
      <div className="flex items-start justify-between gap-3">
        {/* The menu triggers carry their own padding; pulling the row left by
            that much puts the dot, the path and the strip on one left edge. */}
        {/* Only the two switchers live here. Anything deeper stays in the mono
            breadcrumb below, where it can keep real path order. */}
        <div className="-ml-1.5 flex min-w-0 flex-wrap items-center gap-x-0.5 gap-y-1">
          {/* project (the first folder under the mount) — leads the row */}
          {projectSeg ? (
            <>
              <Menu
                label="Switch project"
                width={280}
                trigger={
                  <>
                    {projectOpt?.color ? (
                      <ColorDot color={projectOpt.color} className="size-2.5 shrink-0" />
                    ) : (
                      <Package className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span
                      className={cn(
                        "max-w-[14rem] truncate text-[15px] font-semibold tracking-tight",
                        !projectOpt?.labeled && "font-mono",
                      )}
                    >
                      {projectOpt?.name ?? projectSeg}
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-aria-expanded:rotate-180" />
                  </>
                }
              >
                {(close) => (
                  <>
                    <MenuLabel>Projects in this environment</MenuLabel>
                    {projects.length === 0 ? (
                      <p className="px-2 py-2 text-sm text-muted-foreground">
                        No project folders found here.
                      </p>
                    ) : null}
                    {projects.map((p) => (
                      <MenuItem
                        key={p.project}
                        current={p.project === projectSeg}
                        onSelect={() => {
                          close();
                          router.push(`/secrets/${mount}/${p.project}`);
                        }}
                      >
                        <ColorDot color={p.color} className="size-2 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        {p.labeled ? (
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            {p.project}
                          </span>
                        ) : null}
                        {p.project === projectSeg ? (
                          <Check className="size-3.5 shrink-0 text-primary" />
                        ) : null}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Menu>
              {sep}
            </>
          ) : null}

          {/* environment */}
          <Menu
            label="Switch environment"
            width={288}
            trigger={
              <>
                <ColorDot
                  color={current?.color}
                  className="size-2.5 shrink-0"
                />
                <span
                  className={cn(
                    "max-w-[14rem] truncate text-[15px] font-semibold tracking-tight",
                    !current?.labeled && "font-mono",
                  )}
                >
                  {current?.name ?? mount}
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-aria-expanded:rotate-180" />
              </>
            }
          >
            {(close) => (
              <>
                <MenuLabel>
                  {projectSeg ? "Environments for this project" : "Environments"}
                </MenuLabel>
                {envs.map((env) => {
                  const p = presence[env.mount];
                  return (
                    <MenuItem
                      key={env.mount}
                      current={env.mount === mount}
                      onSelect={() => {
                        close();
                        router.push(hrefFor(env.mount));
                      }}
                    >
                      <ColorDot color={env.color} className="size-2 shrink-0" />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          !env.labeled && "font-mono text-[13px]",
                        )}
                      >
                        {env.name}
                      </span>
                      <PresenceNote presence={p} />
                      {env.mount === mount ? (
                        <Check className="size-3.5 shrink-0 text-primary" />
                      ) : null}
                    </MenuItem>
                  );
                })}
              </>
            )}
          </Menu>
        </div>

        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {/* One quiet reference line: the literal path OpenBao will enforce, and
          that same path in every environment. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        {/* Also the way back up: the chips above switch scope, these walk it.
            Without this the mount root has no affordance at all. */}
        <span className="flex min-w-0 items-center gap-0.5">
          <span className="flex min-w-0 items-center truncate font-mono text-xs text-muted-foreground">
            {pathSegs.map((seg, i) => (
              <React.Fragment key={i}>
                {i > 0 ? <span aria-hidden>/</span> : null}
                <Link
                  href={`/secrets/${pathSegs.slice(0, i + 1).join("/")}`}
                  className="truncate rounded-sm py-0.5 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  {seg}
                </Link>
              </React.Fragment>
            ))}
          </span>
          <CopyButton
            value={fullPath}
            className="size-6 shrink-0 [&_svg]:size-3.5"
          />
        </span>
        {envs.length > 1 ? (
          <>
            <span aria-hidden className="hidden h-3.5 w-px bg-border sm:block" />
            <EnvironmentStrip
              mount={mount}
              segments={segments}
              envs={envs}
              presence={presence}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function PresenceNote({ presence }: { presence?: EnvPresence }) {
  if (!presence || presence.loading) return null;
  if (!presence.reachable) {
    return <span className="shrink-0 text-[11px] text-muted-foreground">—</span>;
  }
  if (!presence.count) {
    return (
      <span className="shrink-0 text-[11px] text-muted-foreground">not here</span>
    );
  }
  return (
    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
      {presence.count}
    </span>
  );
}

/**
 * Every environment at the current path, side by side: how many keys each one
 * holds here and which are missing it entirely. This is the "see all envs for
 * one project" view — one row, always in the same order, never hidden behind a tab.
 */
function EnvironmentStrip({
  mount,
  segments,
  envs,
  presence,
}: {
  mount: string;
  segments: string[];
  envs: EnvOption[];
  presence: Record<string, EnvPresence>;
}) {
  if (envs.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {segments.length ? "This path in" : "Environments"}
      </span>
      <ul className="flex flex-wrap items-center gap-0.5">
        {envs.map((env) => {
          const p = presence[env.mount];
          const isCurrent = env.mount === mount;
          const missing = p && !p.loading && p.reachable && !p.count;
          return (
            <li key={env.mount}>
              <Link
                href={`/secrets/${[env.mount, ...segments].join("/")}`}
                aria-current={isCurrent ? "page" : undefined}
                title={
                  isCurrent
                    ? `${env.name} — you are here`
                    : missing
                      ? `${env.name} — this path has no keys here`
                      : `${env.name} — open this path`
                }
                className={cn(
                  // Only the environment you're in is outlined, so the row reads
                  // as one anchor plus its neighbours, not three competing pills.
                  "flex min-h-11 items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-0",
                  isCurrent
                    ? "border-primary/40 bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  missing && !isCurrent && "border-dashed border-border",
                )}
              >
                <ColorDot
                  color={env.color}
                  className={cn(
                    "size-2 shrink-0",
                    missing && !isCurrent && "opacity-40",
                  )}
                />
                <span className={cn("max-w-[10rem] truncate", !env.labeled && "font-mono")}>
                  {env.name}
                </span>
                <StripCount presence={p} isCurrent={isCurrent} />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StripCount({
  presence,
  isCurrent,
}: {
  presence?: EnvPresence;
  isCurrent: boolean;
}) {
  if (!presence) return null;
  if (presence.loading) {
    return (
      <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-muted-foreground/40" />
    );
  }
  if (!presence.reachable) {
    return (
      <span
        className="shrink-0 text-[11px] text-muted-foreground/60"
        title="Your token cannot list this path here"
      >
        ?
      </span>
    );
  }
  if (!presence.count) {
    return <span className="shrink-0 text-[11px] text-muted-foreground/70">empty</span>;
  }
  return (
    <span
      className={cn(
        "shrink-0 tabular-nums text-[11px]",
        isCurrent ? "text-foreground/70" : "text-muted-foreground",
      )}
    >
      {presence.count}
    </span>
  );
}

/** Small chevron used by folder rows. */
export function RowChevron() {
  return (
    <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-muted-foreground" />
  );
}
