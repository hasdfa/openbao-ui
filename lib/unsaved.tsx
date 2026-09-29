"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { BASE_PATH } from "@/lib/base-path";

type Ctx = {
  setDirty: (id: string, dirty: boolean) => void;
  /** Run `action` now, or after the user agrees to discard unsaved changes. */
  guard: (action: () => void) => void;
};

const UnsavedContext = React.createContext<Ctx | null>(null);

/**
 * Keeps unsaved edits from vanishing: in-app links, guarded actions (switching
 * the selected secret) and closing the tab all ask first while any editor
 * reports real changes.
 */
export function UnsavedProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const dirty = React.useRef(new Set<string>());
  const [pending, setPending] = React.useState<(() => void) | null>(null);

  const setDirty = React.useCallback((id: string, d: boolean) => {
    if (d) dirty.current.add(id);
    else dirty.current.delete(id);
  }, []);

  const guard = React.useCallback((action: () => void) => {
    if (dirty.current.size) setPending(() => action);
    else action();
  }, []);

  React.useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size) e.preventDefault();
    };
    // Capture phase runs before Next's <Link> handler, which honours defaultPrevented.
    const onClick = (e: MouseEvent) => {
      if (!dirty.current.size || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab/window
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith(BASE_PATH)) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      const to = url.pathname.slice(BASE_PATH.length) + url.search + url.hash || "/";
      setPending(() => () => router.push(to));
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [router]);

  return (
    <UnsavedContext.Provider value={{ setDirty, guard }}>
      {children}
      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        title="Discard unsaved changes?"
        description="Your edits haven't been saved and will be lost."
        confirmLabel="Discard changes"
        onConfirm={() => {
          const action = pending;
          dirty.current.clear();
          setPending(null);
          action?.();
        }}
      />
    </UnsavedContext.Provider>
  );
}

/** Report whether this editor has unsaved changes; returns the navigation guard. */
export function useUnsaved(isDirty: boolean): (action: () => void) => void {
  const ctx = React.useContext(UnsavedContext);
  const id = React.useId();
  const setDirty = ctx?.setDirty;
  React.useEffect(() => {
    setDirty?.(id, isDirty);
    return () => setDirty?.(id, false);
  }, [setDirty, id, isDirty]);
  return ctx?.guard ?? ((action) => action());
}

/** The guard alone, for components that navigate but don't edit. */
export function useUnsavedGuard(): (action: () => void) => void {
  return React.useContext(UnsavedContext)?.guard ?? ((action) => action());
}
