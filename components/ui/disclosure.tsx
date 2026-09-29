"use client";

import { ChevronRight } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Inline progressive disclosure: keeps a view simple by default and reveals
 * advanced/rare/dangerous detail only when asked. Use `tone="danger"` for
 * destructive sections.
 */
export function Disclosure({
  label,
  children,
  defaultOpen = false,
  count,
  tone = "default",
  className,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
  tone?: "default" | "danger";
  className?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  // Mount on first open (bodies may fetch), then stay mounted so closing can animate.
  const [mounted, setMounted] = React.useState(defaultOpen);
  // Clip only while moving: an open body must not cut off focus rings or popovers.
  const [settled, setSettled] = React.useState(defaultOpen);
  const bodyId = React.useId();
  return (
    <div className={cn("rounded-md border", className)}>
      <button
        type="button"
        onClick={() => {
          setMounted(true);
          setSettled(false);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-controls={bodyId}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          open && "rounded-b-none",
          tone === "danger" && "text-destructive hover:bg-destructive/5",
        )}
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out",
            open && "rotate-90",
            tone === "danger" && "text-destructive/70",
          )}
        />
        <span className="flex-1 text-left">{label}</span>
        {count != null ? (
          <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        ) : null}
      </button>
      <div
        id={bodyId}
        inert={!open}
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget) setSettled(open);
        }}
      >
        <div
          className={cn(
            "min-h-0 transition-opacity duration-200 ease-out",
            !(open && settled) && "overflow-hidden",
            !open && "opacity-0",
          )}
        >
          {mounted ? <div className="border-t p-3">{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
