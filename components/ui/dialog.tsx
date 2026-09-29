"use client";

import { X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DialogContext = React.createContext<{ titleId: string; close: () => void } | null>(null);

/** Close the surrounding dialog with its exit animation, e.g. from a Cancel button. */
export function useDialogClose(fallback: () => void): () => void {
  return React.useContext(DialogContext)?.close ?? fallback;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Minimal modal: overlay + centered panel, closes on Esc / overlay click.
// Most callers mount it conditionally, so dismissals play the exit here first
// and only then call onClose; an `open` prop flipped to false exits the same way.
export function Dialog({
  open,
  onClose,
  children,
  className,
  dismissible = true,
  dirty = false,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /** false while work is in flight: Esc, the backdrop and the X do nothing. */
  dismissible?: boolean;
  /** Unsaved input: a stray Esc or backdrop click must not throw it away. X and Cancel still close. */
  dirty?: boolean;
}) {
  const [present, setPresent] = React.useState(open);
  const [leaving, setLeaving] = React.useState(false);
  const [prevOpen, setPrevOpen] = React.useState(open);
  const closeAfterExit = React.useRef(false);
  const pressedOverlay = React.useRef(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPresent(true);
      setLeaving(false);
    } else if (present) {
      setLeaving(true);
    }
  }

  const close = React.useCallback(() => {
    if (!dismissible) return;
    closeAfterExit.current = true;
    setLeaving(true);
  }, [dismissible]);

  React.useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !dirty && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [present, close, dirty]);

  // Focus moves in on open (unless a field autofocused) and back to the trigger on close.
  React.useEffect(() => {
    if (!present) return;
    const trigger = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      (panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();
    }
    return () => trigger?.focus?.();
  }, [present]);

  if (!present) return null;

  function onExitEnd(e: React.AnimationEvent) {
    if (!leaving || e.target !== e.currentTarget) return;
    setPresent(false);
    setLeaving(false);
    if (closeAfterExit.current) {
      closeAfterExit.current = false;
      onClose();
    }
  }

  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <DialogContext.Provider value={{ titleId, close }}>
      <div
        data-state={leaving ? "closed" : "open"}
        className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm duration-150 ease-out animate-in fade-in-0 data-[state=closed]:duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        // Only a press that starts and ends on the backdrop dismisses: dragging a
        // text selection out of an input must not throw the form away.
        onMouseDown={(e) => (pressedOverlay.current = e.target === e.currentTarget)}
        onClick={(e) => {
          if (pressedOverlay.current && e.target === e.currentTarget && !dirty) close();
          pressedOverlay.current = false;
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          data-state={leaving ? "closed" : "open"}
          onAnimationEnd={onExitEnd}
          onKeyDown={trapTab}
          className={cn(
            "w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl outline-none duration-200 ease-out animate-in fade-in-0 zoom-in-95 data-[state=closed]:duration-100 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98",
            className,
          )}
        >
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  );
}

export function DialogHeader({
  title,
  description,
  onClose,
}: {
  title: string;
  description?: React.ReactNode;
  onClose?: () => void;
}) {
  const ctx = React.useContext(DialogContext);
  const close = ctx?.close ?? onClose;
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 id={ctx?.titleId} className="text-lg font-semibold text-balance">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground text-pretty">{description}</p>
        ) : null}
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={close}
          className="-mr-2 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/** The standard Cancel action: dismisses through the same exit as Esc. */
export function DialogCancel({
  onClose,
  disabled,
  children = "Cancel",
}: {
  onClose: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const close = useDialogClose(onClose);
  return (
    <Button type="button" variant="outline" onClick={close} disabled={disabled}>
      {children}
    </Button>
  );
}
