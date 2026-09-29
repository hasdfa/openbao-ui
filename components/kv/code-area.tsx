"use client";

import * as React from "react";

import { tokenize, type SecretFormat, type TokenKind } from "@/lib/secret-formats";
import { cn } from "@/lib/utils";

const TONE: Record<TokenKind, string> = {
  key: "text-primary",
  string: "text-amber-700 dark:text-amber-300",
  number: "text-violet-700 dark:text-violet-300",
  literal: "text-pink-700 dark:text-pink-300",
  comment: "text-muted-foreground",
  punct: "text-muted-foreground",
  plain: "",
};

// Shared by the textarea and both overlays: any drift in font, size, padding
// or line height and the colours stop lining up with the caret.
const METRICS = "m-0 whitespace-pre py-3 font-mono text-[13px] leading-5 [tab-size:2]";

/**
 * A plain textarea with syntax colour behind it. The textarea keeps native
 * editing, selection, undo and accessibility; its text is transparent and a
 * highlighted copy scrolls in lockstep underneath.
 */
export function CodeArea({
  value,
  onChange,
  format,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  format: SecretFormat;
  label: string;
  className?: string;
}) {
  const tokens = React.useMemo(() => tokenize(format, value), [format, value]);
  const lineCount = value.split("\n").length;
  const codeRef = React.useRef<HTMLPreElement>(null);
  const gutterRef = React.useRef<HTMLPreElement>(null);

  function sync(e: React.UIEvent<HTMLTextAreaElement>) {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (codeRef.current) {
      codeRef.current.scrollTop = scrollTop;
      codeRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
  }

  return (
    <div
      className={cn(
        "relative flex h-64 min-h-32 resize-y overflow-hidden rounded-md border bg-transparent shadow-xs transition-[box-shadow,border-color] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40",
        className,
      )}
    >
      <pre
        ref={gutterRef}
        aria-hidden
        className={cn(METRICS, "w-10 shrink-0 select-none overflow-hidden border-r bg-muted/40 pr-2 text-right text-muted-foreground/60 tabular-nums")}
      >
        {Array.from({ length: lineCount }, (_, i) => i + 1).join("\n")}
      </pre>
      <div className="relative min-w-0 flex-1">
        <pre
          ref={codeRef}
          aria-hidden
          className={cn(METRICS, "pointer-events-none absolute inset-0 overflow-hidden px-3")}
        >
          {tokens.map((t, i) => (
            <span key={i} className={TONE[t.kind]}>
              {t.text}
            </span>
          ))}
          {/* a trailing newline needs a line to land on, or the last row desyncs */}
          {"\n"}
        </pre>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={sync}
          aria-label={label}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          className={cn(
            METRICS,
            "relative block h-full w-full resize-none overflow-auto bg-transparent px-3 text-transparent caret-foreground outline-none selection:bg-primary/25 selection:text-transparent",
          )}
        />
      </div>
    </div>
  );
}
