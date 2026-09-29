"use client";

import { ChevronRight, FileKey2, Folder, Plus, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useKvList } from "@/lib/kv";
import { cn } from "@/lib/utils";

const normalizePath = (s: string) => s.trim().replace(/^\/+|\/+$/g, "");

/**
 * Lazy KV-tree multi-select. Browses ONE environment's secret tree and reports
 * the selected env-relative paths: a folder → "<path>/*" (recursive), a secret →
 * "<path>" (exact), or "*" for the whole environment. Maps 1:1 to OpenBao policy
 * paths. Folders expand on demand (one list call per opened node).
 */
export function PathPicker({
  mount,
  envPath,
  value,
  onChange,
  label = "Secret paths the client can access",
}: {
  mount?: string;
  envPath?: string;
  value: string[];
  onChange: (paths: string[]) => void;
  label?: string;
}) {
  const [custom, setCustom] = React.useState("");
  const toggle = (p: string) =>
    onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  const addCustom = () => {
    const p = normalizePath(custom);
    if (p && !value.includes(p)) onChange([...value, p]);
    setCustom("");
  };

  // A path is "covered" when "*" or an ancestor "<a>/*" is already selected.
  const covered = (p: string) =>
    (value.includes("*") && p !== "*") ||
    value.some((v) => v !== p && v.endsWith("/*") && p.startsWith(v.slice(0, -1)));

  const ctx: NodeCtx = { mount: mount ?? "", envPath, value, toggle, covered };

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {!mount ? (
        <p className="text-xs text-muted-foreground">Select an environment first.</p>
      ) : (
        <div className="max-h-56 overflow-auto rounded-md border p-1">
          <CheckRow
            label="Everything"
            hint="*"
            icon={Folder}
            depth={0}
            checked={value.includes("*")}
            disabled={false}
            onToggle={() => toggle("*")}
          />
          <Children ctx={ctx} rel="" depth={1} />
        </div>
      )}

      {mount ? (
        <div className="flex items-center gap-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addCustom(); }
            }}
            className="h-8 font-mono text-sm"
            placeholder="add a path or glob — e.g. billing/* (need not exist yet)"
          />
          <Button type="button" variant="outline" size="sm" onClick={addCustom} disabled={!custom.trim()}>
            <Plus /> Add
          </Button>
        </div>
      ) : null}

      {value.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((p) => (
            <span key={p} className="flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pl-2 pr-1 font-mono text-xs">
              {p}
              <button type="button" onClick={() => toggle(p)} title="Remove" aria-label={`Remove ${p}`} className="-my-1 inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Pick at least one path (or “Everything”).</p>
      )}
    </div>
  );
}

type NodeCtx = {
  mount: string;
  envPath?: string;
  value: string[];
  toggle: (p: string) => void;
  covered: (p: string) => boolean;
};

function Children({ ctx, rel, depth }: { ctx: NodeCtx; rel: string; depth: number }) {
  // actual KV path = envPath + rel (the env folder is added by the generator, so
  // selections stay env-relative)
  const actual = [ctx.envPath, rel].filter(Boolean).join("/");
  const { data: keys, isLoading } = useKvList(ctx.mount, actual);

  if (isLoading) {
    return <p className="px-2 py-1 text-xs text-muted-foreground" style={{ paddingLeft: depth * 16 + 8 }}>Loading…</p>;
  }
  const list = keys ?? [];
  if (list.length === 0) {
    return <p className="px-2 py-1 text-xs text-muted-foreground" style={{ paddingLeft: depth * 16 + 8 }}>(empty)</p>;
  }
  return (
    <>
      {list.map((k) => {
        const isFolder = k.endsWith("/");
        const name = k.replace(/\/$/, "");
        const childRel = rel ? `${rel}/${name}` : name;
        return isFolder ? (
          <FolderNode key={k} ctx={ctx} name={name} rel={childRel} depth={depth} />
        ) : (
          <CheckRow
            key={k}
            label={name}
            icon={FileKey2}
            depth={depth}
            checked={ctx.value.includes(childRel) || ctx.covered(childRel)}
            disabled={ctx.covered(childRel)}
            onToggle={() => ctx.toggle(childRel)}
          />
        );
      })}
    </>
  );
}

function FolderNode({ ctx, name, rel, depth }: { ctx: NodeCtx; name: string; rel: string; depth: number }) {
  const [open, setOpen] = React.useState(false);
  const path = `${rel}/*`;
  return (
    <>
      <CheckRow
        label={name}
        hint="/*"
        icon={Folder}
        depth={depth}
        checked={ctx.value.includes(path) || ctx.covered(path)}
        disabled={ctx.covered(path)}
        onToggle={() => ctx.toggle(path)}
        open={open}
        onExpand={() => setOpen((o) => !o)}
      />
      {open ? <Children ctx={ctx} rel={rel} depth={depth + 1} /> : null}
    </>
  );
}

function CheckRow({
  label,
  hint,
  icon: Icon,
  depth,
  checked,
  disabled,
  onToggle,
  open,
  onExpand,
}: {
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  depth: number;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  open?: boolean;
  onExpand?: () => void;
}) {
  return (
    <div
      className={cn("flex items-center gap-1.5 rounded-md py-1 pr-2 text-sm hover:bg-accent/60", disabled && "opacity-60")}
      style={{ paddingLeft: depth * 16 + 4 }}
    >
      {onExpand ? (
        <button type="button" onClick={onExpand} className="shrink-0 rounded p-0.5 hover:bg-accent" aria-label={open ? "Collapse" : "Expand"}>
          <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-90")} />
        </button>
      ) : (
        <span className="w-[18px] shrink-0" />
      )}
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono">{label}</span>
        {hint ? <span className="shrink-0 font-mono text-xs text-muted-foreground">{hint}</span> : null}
      </label>
    </div>
  );
}
