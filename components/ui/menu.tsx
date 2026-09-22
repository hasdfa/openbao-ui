"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Lightweight dropdown for switching scope. Positioned `fixed` from the
 * trigger's rect so it escapes the browser's scroll containers instead of being
 * clipped by them, and closes on Escape, outside click, or resize.
 */
export function Menu({
  trigger,
  label,
  children,
  className,
  width = 260,
  align = "start",
}: {
  trigger: React.ReactNode;
  label: string;
  children: (close: () => void) => React.ReactNode;
  className?: string;
  width?: number;
  align?: "start" | "end";
}) {
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const place = React.useCallback(() => {
    const el = triggerRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close]);

  // move focus into the panel on open, starting at the current value
  React.useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = panel.querySelectorAll<HTMLElement>('[role="menuitem"]');
    const current = panel.querySelector<HTMLElement>('[data-current="true"]');
    (current ?? items[0])?.focus();
  }, [open, rect]);

  function onPanelKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "ArrowDown" ? at + 1 : at - 1;
    items[(next + items.length) % items.length].focus();
  }

  const top = rect ? rect.bottom + 6 : 0;
  const left = rect
    ? Math.max(
        8,
        Math.min(
          align === "end" ? rect.right - width : rect.left,
          (typeof window !== "undefined" ? window.innerWidth : width) - width - 8,
        ),
      )
    : 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          "group inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          open && "bg-accent",
          className,
        )}
      >
        {trigger}
      </button>

      {open && rect ? (
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          onKeyDown={onPanelKeyDown}
          style={{ top, left, width }}
          className="fixed z-50 max-h-[min(24rem,60vh)] overflow-auto rounded-xl border bg-popover p-1 shadow-lg duration-150 animate-in fade-in-0 zoom-in-95"
        >
          {children(close)}
        </div>
      ) : null}
    </>
  );
}

export function MenuItem({
  children,
  onSelect,
  current = false,
  disabled = false,
  className,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  current?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-current={current}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-100 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45",
        current && "bg-accent/60 font-medium",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}
