"use client";

import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePreferences } from "@/lib/preferences";
import { CodeArea } from "@/components/kv/code-area";
import { PARSE, STRINGIFY, type SecretFormat } from "@/lib/secret-formats";
import { cn } from "@/lib/utils";

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
        aria-label={shown ? `Hide ${name}` : `Show ${name}`}
        aria-pressed={shown}
      >
        {shown ? <EyeOff /> : <Eye />}
      </Button>
      <CopyButton value={value} />
    </li>
  );
}

// --- editor: key/value fields, or the same data as .env, YAML or JSON text ---
export type EditorHandle = {
  /** Returns the edited object, or throws if the text doesn't parse. */
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
  // A value typed into the blank row, with no key yet, used to vanish on save.
  if (rows.some((row) => row.placeholder && row.value !== "")) {
    throw new Error("Every value needs a key");
  }
  const kept = rows.filter(
    (row) => !row.placeholder && !(row.key === "" && !row.keepEmptyKey),
  );
  const keys = kept.map((row) => row.key);
  if (new Set(keys).size !== keys.length) {
    throw new Error("Duplicate keys");
  }
  return Object.fromEntries(kept.map(({ key, value }) => [key, value]));
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

export type EditorMode = "kv" | SecretFormat;

export const EDITOR_MODES: { value: EditorMode; label: string }[] = [
  { value: "kv", label: "Fields" },
  { value: "dotenv", label: ".env" },
  { value: "yaml", label: "YAML" },
  { value: "json", label: "JSON" },
];

export const KvKeyValueEditor = React.forwardRef<
  EditorHandle,
  {
    initial: Record<string, unknown>;
    /** Called when the edited data starts or stops differing from `initial`. */
    onDirtyChange?: (dirty: boolean) => void;
  }
>(function KvKeyValueEditor({ initial, onDirtyChange }, ref) {
  const { prefs } = usePreferences();
  // Fields and .env hold only flat strings; nested data opens in the user's
  // text format of choice, else JSON.
  const [mode, setMode] = React.useState<EditorMode>(() => {
    const pref = prefs.editorMode;
    if (!hasNonString(initial)) return pref;
    return pref === "yaml" || pref === "json" ? pref : "json";
  });
  const [rows, setRows] = React.useState<Row[]>(() => toRows(initial));
  const [text, setText] = React.useState(() =>
    mode === "kv" ? "" : STRINGIFY[mode](initial),
  );
  const [modeError, setModeError] = React.useState<string | null>(null);

  const current = (): Record<string, unknown> =>
    mode === "kv" ? rowsToData(rows) : PARSE[mode](text);

  React.useImperativeHandle(ref, () => ({ getData: current }));

  // Compare data, not text: switching format alone isn't an edit. Text that
  // doesn't parse counts as changed.
  const [initialJson] = React.useState(() => JSON.stringify(initial));
  React.useEffect(() => {
    let changed = true;
    try {
      changed = JSON.stringify(mode === "kv" ? rowsToData(rows) : PARSE[mode](text)) !== initialJson;
    } catch {
      /* unparseable: changed */
    }
    onDirtyChange?.(changed);
  }, [mode, rows, text, initialJson, onDirtyChange]);

  // Convert through the data, so a switch can never silently change a value;
  // anything the target format can't hold keeps you where you are, with why.
  function switchTo(next: EditorMode) {
    if (next === mode) return;
    try {
      const data = current();
      if (next === "kv") {
        if (hasNonString(data)) throw new Error("Nested values can't be edited as fields; use YAML or JSON");
        setRows(toRows(data));
      } else {
        setText(STRINGIFY[next](data));
      }
      setModeError(null);
      setMode(next);
    } catch (e) {
      setModeError(e instanceof Error ? e.message : "Can't convert this data");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <div
          role="radiogroup"
          aria-label="Edit as"
          className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs"
        >
          {EDITOR_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => switchTo(m.value)}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                mode === m.value
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {modeError ? (
        <p role="alert" className="text-sm text-destructive">{modeError}</p>
      ) : null}

      {mode !== "kv" ? (
        <CodeArea
          value={text}
          onChange={setText}
          format={mode}
          label={`Secret data as ${EDITOR_MODES.find((m) => m.value === mode)?.label}`}
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
              {/* A textarea, not an input: inputs strip line breaks, which
                  silently flattened pasted certificates and private keys. */}
              <textarea
                placeholder="value"
                value={row.value}
                rows={1}
                spellCheck={false}
                aria-label={row.key ? `Value for ${row.key}` : "Value"}
                className="max-h-64 min-h-9 flex-1 resize-y rounded-md border bg-transparent px-3 py-[7px] font-mono text-sm leading-5 shadow-xs transition-[color,box-shadow,border-color] [field-sizing:content] placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
                title="Remove field"
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
