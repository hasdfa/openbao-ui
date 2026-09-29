"use client";

import { CheckCircle2, X, XCircle } from "lucide-react";
import * as React from "react";

import { usePreferences } from "@/lib/preferences";
import { toast, ToastItem } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Shown = ToastItem & { leaving?: boolean };
type Timer = { handle?: ReturnType<typeof setTimeout>; started: number; remaining: number };

export function Toaster() {
  const [items, setItems] = React.useState<Shown[]>([]);
  const { prefs } = usePreferences();
  // read the latest duration without re-subscribing on every change
  const durationRef = React.useRef(prefs.toastDurationMs);
  durationRef.current = prefs.toastDurationMs;
  const timers = React.useRef(new Map<number, Timer>());
  const paused = React.useRef(false);

  // Leaving plays the exit; the item is dropped when that animation ends.
  const dismiss = React.useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t?.handle) clearTimeout(t.handle);
    timers.current.delete(id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, leaving: true } : i)));
  }, []);

  const arm = React.useCallback(
    (id: number, t: Timer) => {
      t.started = Date.now();
      t.handle = setTimeout(() => dismiss(id), t.remaining);
    },
    [dismiss],
  );

  // A toast you are reading (hovered) or cannot see (tab hidden) must not expire.
  const pause = React.useCallback(() => {
    if (paused.current) return;
    paused.current = true;
    for (const t of timers.current.values()) {
      if (t.handle) clearTimeout(t.handle);
      t.handle = undefined;
      t.remaining = Math.max(0, t.remaining - (Date.now() - t.started));
    }
  }, []);
  const resume = React.useCallback(() => {
    if (!paused.current || document.hidden) return;
    paused.current = false;
    for (const [id, t] of timers.current) arm(id, t);
  }, [arm]);

  React.useEffect(() => {
    const live = timers.current;
    const unsubscribe = toast.subscribe((item) => {
      setItems((prev) => [...prev, item]);
      const t: Timer = { started: Date.now(), remaining: durationRef.current };
      live.set(item.id, t);
      if (!paused.current) arm(item.id, t);
    });
    const onVisibility = () => (document.hidden ? pause() : resume());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      live.forEach((t) => t.handle && clearTimeout(t.handle));
      live.clear();
    };
  }, [arm, pause, resume]);

  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col gap-2 sm:left-auto sm:w-full sm:max-w-sm"
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          data-state={t.leaving ? "closed" : "open"}
          onAnimationEnd={(e) => {
            if (t.leaving && e.target === e.currentTarget) {
              setItems((prev) => prev.filter((i) => i.id !== t.id));
            }
          }}
          className={cn(
            "pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-card p-3 text-sm shadow-lg duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-4 data-[state=closed]:duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-2",
            t.kind === "error" ? "border-destructive/40" : "border-emerald-500/40",
          )}
        >
          {t.kind === "error" ? (
            <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          )}
          <span className="min-w-0 flex-1 break-words">{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="-m-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
