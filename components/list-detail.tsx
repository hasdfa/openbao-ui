"use client";

import { ChevronLeft } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const Ctx = React.createContext<{ open: boolean; onBack: () => void; backLabel: string } | null>(null);

/**
 * List + detail split. Side by side from md up; on a phone the list fills the
 * screen and picking an item swaps it for the detail, with a way back.
 */
export function ListDetail({
  open,
  onBack,
  backLabel,
  className,
  children,
}: {
  /** Something is selected, so the detail has content to show. */
  open: boolean;
  onBack: () => void;
  backLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Ctx.Provider value={{ open, onBack, backLabel }}>
      <div className={cn("flex min-h-0 flex-col md:flex-row", className)}>{children}</div>
    </Ctx.Provider>
  );
}

export function ListPane({ className, children }: { className?: string; children: React.ReactNode }) {
  const ctx = React.useContext(Ctx);
  return (
    <div className={cn("min-h-0 shrink-0 md:border-r", ctx?.open && "max-md:hidden", className)}>
      {children}
    </div>
  );
}

export function DetailPane({ className, children }: { className?: string; children: React.ReactNode }) {
  const ctx = React.useContext(Ctx);
  return (
    <div className={cn("min-h-0 min-w-0 flex-1", !ctx?.open && "max-md:hidden", className)}>
      {ctx?.open ? (
        <button
          type="button"
          onClick={ctx.onBack}
          className="-ml-1 mb-3 inline-flex min-h-11 items-center gap-1 rounded-md px-1 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:hidden"
        >
          <ChevronLeft className="size-4" /> {ctx.backLabel}
        </button>
      ) : null}
      {children}
    </div>
  );
}
