"use client";

import {
  ArrowDownAZ,
  Clock,
  FileKey,
  Folder,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { CopyButton } from "@/components/copy-button";
import { ColorDot } from "@/components/label-editor";
import { RowChevron, type EnvOption } from "@/components/kv/kv-scope";
import { Button } from "@/components/ui/button";
import { type KvRowMeta } from "@/lib/kv";
import { cn } from "@/lib/utils";

export type Sort = "name" | "updated";

export type CrossEnv = Record<
  string,
  { keys: Set<string>; loading: boolean; reachable: boolean }
>;

const join = (...parts: string[]) =>
  parts.filter(Boolean).join("/").replace(/\/+/g, "/");

/** "2 minutes ago" from an ISO timestamp, or null when there's nothing to show. */
function timeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const secs = Math.round((then - Date.now()) / 1000);
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
    [Infinity, "year"],
  ];
  let value = secs;
  for (const [span, unit] of steps) {
    if (Math.abs(value) < span) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
        Math.round(value),
        unit,
      );
    }
    value /= span;
  }
  return null;
}

/** True below the `md` breakpoint, after mount. */
function useNarrowViewport() {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

export function KvTable({
  mount,
  folder,
  keys,
  isV2,
  compact,
  selectedPath,
  onSelect,
  currentEnv,
  otherEnvs,
  across,
  rowMeta,
  metaAvailable,
  onDeleteRequest,
  onNewSecret,
  filter,
  onFilterChange,
  sort,
  onSortChange,
}: {
  mount: string;
  folder: string;
  keys: string[];
  isV2: boolean;
  compact: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  currentEnv?: EnvOption;
  otherEnvs: EnvOption[];
  across: CrossEnv;
  rowMeta: Record<string, KvRowMeta>;
  metaAvailable: boolean;
  onDeleteRequest: (paths: string[]) => void;
  onNewSecret: () => void;
  filter: string;
  onFilterChange: (v: string) => void;
  sort: Sort;
  onSortChange: (s: Sort) => void;
}) {
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const filterRef = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const base = `/secrets/${mount}`;
  // A phone has no more room for the metadata columns than the split view does.
  const narrow = useNarrowViewport();
  const dense = compact || narrow;
  const showEnvs = !dense && otherEnvs.length > 0;
  const showMeta = !dense && isV2;

  const folders = keys.filter((k) => k.endsWith("/"));
  const secrets = keys.filter((k) => !k.endsWith("/"));

  const q = filter.trim().toLowerCase();
  const match = (k: string) => !q || k.toLowerCase().includes(q);
  const visibleFolders = folders.filter(match);
  const visibleSecrets = secrets.filter(match);

  // Folders always lead — a file browser that reorders its directories on sort
  // makes the tree harder to hold in your head, not easier.
  const sortedFolders = [...visibleFolders].sort((a, b) => a.localeCompare(b));
  const sortedSecrets = [...visibleSecrets].sort((a, b) => {
    if (sort === "updated") {
      const ta = rowMeta[join(folder, a)]?.updated;
      const tb = rowMeta[join(folder, b)]?.updated;
      if (ta && tb) return new Date(tb).getTime() - new Date(ta).getTime();
      if (ta) return -1;
      if (tb) return 1;
    }
    return a.localeCompare(b);
  });

  // Selection is resolved against what's actually on screen, so filtering or a
  // delete can't leave a phantom count behind — no pruning effect needed.
  const secretPaths = new Set(sortedSecrets.map((s) => join(folder, s)));
  const active = [...checked].filter((p) => secretPaths.has(p));

  // "/" jumps to the filter from anywhere on the page
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (el?.isContentEditable) return;
      e.preventDefault();
      filterRef.current?.focus();
      filterRef.current?.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function moveFocus(delta: number) {
    const rows = Array.from(
      bodyRef.current?.querySelectorAll<HTMLElement>("[data-row-target]") ?? [],
    );
    if (!rows.length) return;
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const next = at < 0 ? (delta > 0 ? 0 : rows.length - 1) : at + delta;
    rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus();
  }

  function onTableKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(-1);
    }
  }

  const allChecked =
    sortedSecrets.length > 0 && active.length === sortedSecrets.length;
  const someChecked = active.length > 0 && !allChecked;

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(secretPaths));
  }
  function toggleOne(path: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  const nothingHere = keys.length === 0;
  const filteredOut = !nothingHere && sortedFolders.length + sortedSecrets.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* toolbar */}
      {!nothingHere ? (
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 md:px-6">
          <div className="relative w-full min-w-0 md:max-w-xs md:flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={filterRef}
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && filter) {
                  e.stopPropagation();
                  onFilterChange("");
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  moveFocus(1);
                }
              }}
              aria-label="Filter keys at this path"
              placeholder={`Filter ${keys.length} ${keys.length === 1 ? "key" : "keys"}…`}
              className="h-8 w-full rounded-md border bg-transparent pl-8 pr-8 text-sm transition-[border-color,box-shadow] placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            {filter ? (
              <button
                type="button"
                onClick={() => {
                  onFilterChange("");
                  filterRef.current?.focus();
                }}
                aria-label="Clear filter"
                className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 font-mono text-[10px] text-muted-foreground/70 md:block">
                /
              </kbd>
            )}
          </div>

          {isV2 && !compact ? (
            <div className="flex items-center rounded-md border p-0.5">
              <SortButton
                active={sort === "name"}
                onClick={() => onSortChange("name")}
                icon={ArrowDownAZ}
                label="Name"
              />
              <SortButton
                active={sort === "updated"}
                onClick={() => onSortChange("updated")}
                icon={Clock}
                label="Recent"
                disabled={!metaAvailable}
                title={
                  metaAvailable
                    ? "Sort by last change"
                    : "Too many keys here to load change times"
                }
              />
            </div>
          ) : null}

          <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {summary(sortedFolders.length, sortedSecrets.length, !!q)}
          </span>
        </div>
      ) : null}

      {/* bulk action bar — only appears with a selection, never a hover reveal */}
      {active.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 border-b bg-accent/50 px-4 py-2 md:px-6">
          <span className="text-sm font-medium tabular-nums">
            {active.length} selected
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setChecked(new Set())}
          >
            Clear
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="ml-auto"
            onClick={() => onDeleteRequest(active)}
          >
            <Trash2 /> Delete {active.length}
          </Button>
        </div>
      ) : null}

      <div
        ref={bodyRef}
        onKeyDown={onTableKeyDown}
        className="min-h-0 flex-1 overflow-auto"
      >
        {nothingHere || filteredOut ? null : (
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-20 [&>th]:border-b [&>th]:bg-background [&>th]:px-2 [&>th]:py-2 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-medium [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-muted-foreground">
                <th className="w-10 !pl-4 md:!pl-6">
                  {sortedSecrets.length ? (
                    <>
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = someChecked;
                        }}
                        onChange={toggleAll}
                        aria-label={
                          allChecked ? "Clear selection" : "Select all secrets here"
                        }
                        className="size-3.5 cursor-pointer accent-[var(--color-primary)]"
                      />
                    </>
                  ) : null}
                </th>
                <th className={dense ? undefined : "w-[28rem]"}>Key</th>
                {showEnvs ? <th className="w-32">Environments</th> : null}
                {showMeta ? <th className="w-14">Ver</th> : null}
                {showMeta ? <th className="w-32">Last change</th> : null}
                <th className={cn("w-12", dense && "!pr-4 md:!pr-6")}>
                  <span className="sr-only">Row actions</span>
                </th>
                {dense ? null : <th className="!pr-4 md:!pr-6" />}
              </tr>
            </thead>
            <tbody>
              {sortedFolders.map((name) => (
                <Row
                  key={name}
                  kind="folder"
                  name={name.replace(/\/$/, "")}
                  rawKey={name}
                  href={`${base}/${join(folder, name)}`}
                  path={join(folder, name)}
                  dense={dense}
                  showEnvs={showEnvs}
                  showMeta={showMeta}
                  currentEnv={currentEnv}
                  otherEnvs={otherEnvs}
                  across={across}
                />
              ))}
              {sortedSecrets.map((name) => {
                const path = join(folder, name);
                return (
                  <Row
                    key={name}
                    kind="secret"
                    name={name}
                    rawKey={name}
                    path={path}
                    selected={selectedPath === path}
                    onOpen={() => onSelect(path)}
                    checked={checked.has(path)}
                    onCheck={() => toggleOne(path)}
                    meta={rowMeta[path]}
                    metaAvailable={metaAvailable}
                    dense={dense}
                    showEnvs={showEnvs}
                    showMeta={showMeta}
                    currentEnv={currentEnv}
                    otherEnvs={otherEnvs}
                    across={across}
                    fullPath={`${mount}/${path}`}
                  />
                );
              })}
            </tbody>
          </table>
        )}

        {filteredOut ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium">No key matches “{filter}”</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {keys.length} {keys.length === 1 ? "key" : "keys"} at this path.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => {
                onFilterChange("");
                filterRef.current?.focus();
              }}
            >
              Clear filter
            </Button>
          </div>
        ) : null}

        {nothingHere ? (
          <EmptyPath
            folder={folder}
            otherEnvs={otherEnvs}
            across={across}
            onNewSecret={onNewSecret}
          />
        ) : null}
      </div>
    </div>
  );
}

function summary(folders: number, secrets: number, filtered: boolean) {
  const parts = [];
  if (folders) parts.push(`${folders} folder${folders === 1 ? "" : "s"}`);
  if (secrets) parts.push(`${secrets} secret${secrets === 1 ? "" : "s"}`);
  if (!parts.length) return "nothing here";
  return `${filtered ? "showing " : ""}${parts.join(" · ")}`;
}

function SortButton({
  active,
  onClick,
  icon: Icon,
  label,
  disabled,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={cn(
        "flex h-6 items-center gap-1.5 rounded px-2 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40",
        active
          ? "bg-secondary font-medium text-secondary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

const cell =
  "border-b px-2 py-0 align-middle transition-colors duration-150";

function Row({
  kind,
  name,
  rawKey,
  path,
  fullPath,
  href,
  selected = false,
  onOpen,
  checked = false,
  onCheck,
  meta,
  metaAvailable = false,
  dense,
  showEnvs,
  showMeta,
  currentEnv,
  otherEnvs,
  across,
}: {
  kind: "folder" | "secret";
  name: string;
  rawKey: string;
  path: string;
  fullPath?: string;
  href?: string;
  selected?: boolean;
  onOpen?: () => void;
  checked?: boolean;
  onCheck?: () => void;
  meta?: KvRowMeta;
  metaAvailable?: boolean;
  dense: boolean;
  showEnvs: boolean;
  showMeta: boolean;
  currentEnv?: EnvOption;
  otherEnvs: EnvOption[];
  across: CrossEnv;
}) {
  const isFolder = kind === "folder";
  // ::after stretches over the whole <tr> (the nearest positioned ancestor), so
  // a click anywhere on the row opens it while the checkbox and copy stay live.
  const target =
    "flex h-11 min-w-0 items-center gap-2 text-left focus:outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring/70";

  const label = (
    <>
      {isFolder ? (
        <Folder className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <FileKey
          className={cn(
            "size-4 shrink-0",
            selected ? "text-primary" : "text-muted-foreground",
          )}
        />
      )}
      <span
        className={cn(
          "truncate font-mono",
          isFolder ? "font-medium" : selected ? "font-medium text-foreground" : "",
        )}
      >
        {name}
      </span>
      {isFolder ? <RowChevron /> : null}
    </>
  );

  return (
    <tr
      className={cn(
        "group/row relative",
        selected ? "bg-accent" : "hover:bg-accent/45",
      )}
    >
      <td className={cn(cell, "!pl-4 md:!pl-6")}>
        {isFolder ? (
          <span className="block size-3.5" />
        ) : (
          <input
            type="checkbox"
            checked={checked}
            onChange={onCheck}
            aria-label={`Select ${path}`}
            className="relative z-10 size-3.5 cursor-pointer accent-[var(--color-primary)]"
          />
        )}
      </td>

      <td className={cell}>
        {isFolder ? (
          <Link href={href!} data-row-target className={target}>
            {label}
          </Link>
        ) : (
          <button type="button" onClick={onOpen} data-row-target className={cn(target, "w-full")}>
            {label}
          </button>
        )}
      </td>

      {showEnvs ? (
        <td className={cell}>
          <EnvDots
            rawKey={rawKey}
            currentEnv={currentEnv}
            otherEnvs={otherEnvs}
            across={across}
            name={name}
          />
        </td>
      ) : null}

      {showMeta ? (
        <td className={cn(cell, "tabular-nums text-muted-foreground")}>
          {isFolder ? (
            <span className="text-muted-foreground/40">—</span>
          ) : meta ? (
            <span title={`Current version ${meta.version}`}>v{meta.version}</span>
          ) : metaAvailable ? (
            <span className="block h-3 w-6 animate-pulse rounded bg-muted" />
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
        </td>
      ) : null}

      {showMeta ? (
        <td className={cn(cell, "tabular-nums text-muted-foreground")}>
          {isFolder ? (
            <span className="text-muted-foreground/40">—</span>
          ) : meta?.updated ? (
            <span title={new Date(meta.updated).toLocaleString()}>
              {timeAgo(meta.updated) ?? "—"}
            </span>
          ) : metaAvailable ? (
            <span className="block h-3 w-20 animate-pulse rounded bg-muted" />
          ) : (
            <span className="text-muted-foreground/40">—</span>
          )}
        </td>
      ) : null}

      <td className={cn(cell, dense && "!pr-4 md:!pr-6")}>
        {fullPath ? (
          <div className="relative z-10 flex justify-end transition-opacity duration-150 md:opacity-0 md:focus-within:opacity-100 md:group-hover/row:opacity-100">
            <CopyButton value={fullPath} />
          </div>
        ) : null}
      </td>
      {dense ? null : <td className={cn(cell, "!pr-4 md:!pr-6")} />}
    </tr>
  );
}

/**
 * Which other environments hold this exact key. One listing per environment
 * covers every row, so this costs nothing per row.
 */
function EnvDots({
  rawKey,
  name,
  currentEnv,
  otherEnvs,
  across,
}: {
  rawKey: string;
  name: string;
  currentEnv?: EnvOption;
  otherEnvs: EnvOption[];
  across: CrossEnv;
}) {
  // Same order as the environment strip above, so a dot sits in the same slot
  // on every row and drift shows up as a gap in a column.
  const ordered = currentEnv
    ? [...otherEnvs, currentEnv].sort((a, b) => a.name.localeCompare(b.name))
    : otherEnvs;
  const state = ordered.map((env) => {
    if (env.mount === currentEnv?.mount) {
      return { env, loading: false, present: true, unknown: false };
    }
    const a = across[env.mount];
    return {
      env,
      loading: a?.loading ?? true,
      present: !!a?.keys.has(rawKey),
      unknown: a ? !a.reachable : true,
    };
  });

  const present = state.filter((s) => s.present).length;
  const total = state.length;
  const missing = state.filter((s) => !s.present && !s.unknown).map((s) => s.env.name);
  const loading = state.some((s) => s.loading);

  const title = loading
    ? "Checking other environments…"
    : missing.length
      ? `${name} is missing in ${missing.join(", ")}`
      : `${name} is in every environment`;

  return (
    <span className="flex items-center gap-1.5" title={title}>
      <span className="flex items-center gap-1">
        {state.slice(0, 5).map((s) =>
          s.loading ? (
            <span
              key={s.env.mount}
              className="size-2 animate-pulse rounded-full bg-muted-foreground/25"
            />
          ) : s.present ? (
            <ColorDot key={s.env.mount} color={s.env.color} className="size-2" />
          ) : (
            <span
              key={s.env.mount}
              className={cn(
                "size-2 rounded-full border border-dashed",
                s.unknown ? "border-muted-foreground/30" : "border-muted-foreground/60",
              )}
            />
          ),
        )}
        {state.length > 5 ? (
          <span className="text-[10px] text-muted-foreground">
            +{state.length - 5}
          </span>
        ) : null}
      </span>
      {!loading && missing.length ? (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {present}/{total}
        </span>
      ) : null}
      <span className="sr-only">{title}</span>
    </span>
  );
}

/**
 * The empty state does real work: at a path that exists elsewhere it says so
 * and offers the jump, instead of pretending the key was never created.
 */
function EmptyPath({
  folder,
  otherEnvs,
  across,
  onNewSecret,
}: {
  folder: string;
  otherEnvs: EnvOption[];
  across: CrossEnv;
  onNewSecret: () => void;
}) {
  const elsewhere = otherEnvs
    .map((env) => ({ env, count: across[env.mount]?.keys.size ?? 0 }))
    .filter((e) => e.count > 0);

  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border bg-muted/40 text-muted-foreground">
        <FileKey className="size-5" />
      </div>
      <p className="text-sm font-medium">
        {folder ? "Nothing at this path yet" : "This environment is empty"}
      </p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Secrets are created at a path — {" "}
        <span className="font-mono text-xs">
          {folder ? `${folder}/database` : "payments/config"}
        </span>
        . Folders appear on their own once a secret sits inside one.
      </p>
      <Button size="sm" className="mt-4" onClick={onNewSecret}>
        New secret here
      </Button>

      {elsewhere.length ? (
        <div className="mt-8 border-t pt-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            This path exists elsewhere
          </p>
          <ul className="mt-2 flex flex-wrap justify-center gap-1.5">
            {elsewhere.map(({ env, count }) => (
              <li key={env.mount}>
                <Link
                  href={`/secrets/${join(env.mount, folder)}`}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <ColorDot color={env.color} className="size-2" />
                  <span className={cn(!env.labeled && "font-mono")}>{env.name}</span>
                  <span className="tabular-nums text-muted-foreground">{count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
