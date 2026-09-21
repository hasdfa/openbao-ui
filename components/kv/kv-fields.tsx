"use client";

import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePreferences } from "@/lib/preferences";

function display(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

// --- read-only viewer: masked values + per-row show/hide + copy ---
export function KvValueViewer({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        This version has no fields.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-md border">
      {entries.map(([k, v]) => (
        <ViewerRow key={k} name={k} value={display(v)} />
      ))}
    </ul>
  );
}

function ViewerRow({ name, value }: { name: string; value: string }) {
  const { prefs } = usePreferences();
  const [shown, setShown] = React.useState(prefs.revealSecrets);
  return (
    <li className="flex items-center gap-2 px-3 py-2 text-sm">
      <span className="w-1/3 shrink-0 truncate font-mono font-medium">
        {name}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
        {shown ? value : "••••••••••"}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShown((s) => !s)}
        title={shown ? "Hide" : "Show"}
      >
        {shown ? <EyeOff /> : <Eye />}
      </Button>
      <CopyButton value={value} />
    </li>
  );
}

// --- editor: key/value rows with a raw-JSON fallback for nested data ---
export type EditorHandle = {
  /** Returns the edited object, or throws if raw JSON is invalid. */
  getData: () => Record<string, unknown>;
};

type Row = {
  key: string;
  value: string;
  placeholder?: boolean;
  /** Empty key loaded from OpenBao — keep it. User-cleared keys are dropped. */
  keepEmptyKey?: boolean;
};

function toRows(data: Record<string, unknown>): Row[] {
  const rows = Object.entries(data).map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
    ...(key === "" ? { keepEmptyKey: true } : {}),
  }));
  return rows.length ? rows : [{ key: "", value: "", placeholder: true }];
}

export function rowsToData(rows: Row[]): Record<string, unknown> {
  return Object.fromEntries(
    rows
      .filter((row) => !row.placeholder && !(row.key === "" && !row.keepEmptyKey))
      .map(({ key, value }) => [key, value]),
  );
}

const hasNonString = (data: Record<string, unknown>) =>
  Object.values(data).some((v) => typeof v !== "string");

export function jsonToRows(json: string): Row[] {
  const parsed: unknown = JSON.parse(json);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Secret data must be a JSON object");
  }
  const data = parsed as Record<string, unknown>;
  if (hasNonString(data)) {
    throw new Error("Key/value editor only supports string values");
  }
  return toRows(data);
}

export function snapshotKvDraft(
  data: Record<string, unknown>,
  cas: number | undefined,
) {
  return { data: structuredClone(data), cas };
}

export const KvKeyValueEditor = React.forwardRef<
  EditorHandle,
  { initial: Record<string, unknown> }
>(function KvKeyValueEditor({ initial }, ref) {
  const { prefs } = usePreferences();
  // nested data forces raw JSON; otherwise honor the user's default editor
  const [raw, setRaw] = React.useState(
    () => hasNonString(initial) || prefs.editorMode === "json",
  );
  const [rows, setRows] = React.useState<Row[]>(() => toRows(initial));
  const [json, setJson] = React.useState(() =>
    JSON.stringify(initial, null, 2),
  );
  const [modeError, setModeError] = React.useState<string | null>(null);

  React.useImperativeHandle(ref, () => ({
    getData() {
      if (raw) {
        const parsed = JSON.parse(json);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Secret data must be a JSON object");
        }
        return parsed as Record<string, unknown>;
      }
      return rowsToData(rows);
    },
  }));

  function switchToRaw() {
    const out = rowsToData(rows);
    setJson(JSON.stringify(out, null, 2));
    setModeError(null);
    setRaw(true);
  }

  function switchToRows() {
    try {
      setRows(jsonToRows(json));
      setModeError(null);
      setRaw(false);
    } catch (e) {
      setModeError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={raw ? switchToRows : switchToRaw}
        >
          {raw ? "Key/value editor" : "Raw JSON"}
        </Button>
      </div>

      {modeError ? (
        <p role="alert" className="text-sm text-destructive">{modeError}</p>
      ) : null}

      {raw ? (
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          spellCheck={false}
          className="h-64 w-full rounded-md border bg-transparent p-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder="key"
                value={row.key}
                className="w-1/3 font-mono"
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, j) =>
                      j === i
                        ? {
                            ...r,
                            key: e.target.value,
                            placeholder: r.placeholder && e.target.value === "",
                          }
                        : r,
                    ),
                  )
                }
              />
              <Input
                placeholder="value"
                value={row.value}
                className="flex-1 font-mono"
                onChange={(e) =>
                  setRows((rs) =>
                    rs.map((r, j) =>
                      j === i ? { ...r, value: e.target.value } : r,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  setRows((rs) =>
                    rs.length > 1 ? rs.filter((_, j) => j !== i) : rs,
                  )
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setRows((rs) => [...rs, { key: "", value: "", placeholder: true }])}
          >
            <Plus /> Add field
          </Button>
        </div>
      )}
    </div>
  );
});
