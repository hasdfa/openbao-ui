"use client";

import { Menu, X } from "lucide-react";
import * as React from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useNamespace } from "@/lib/namespace";
import { UnsavedProvider } from "@/lib/unsaved";
import { cn } from "@/lib/utils";

export function AppShell({
  displayName,
  children,
}: {
  displayName: string;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = React.useState(false);
  const { namespace } = useNamespace();

  React.useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <UnsavedProvider>
      {/* Fixed to the viewport so <main> is the one scroller: the sidebar and
          the section headers stay put, and pages can size themselves with h-full. */}
      <div className="flex h-dvh">
        {/* Both stay mounted on mobile so the drawer can slide both ways; closed,
            they are invisible and inert rather than removed. */}
        <button
          type="button"
          aria-label="Close navigation"
          tabIndex={navOpen ? 0 : -1}
          className={cn(
            "fixed inset-0 z-40 bg-foreground/40 transition-opacity ease-out md:hidden",
            navOpen ? "opacity-100 duration-300" : "pointer-events-none opacity-0 duration-200",
          )}
          onClick={() => setNavOpen(false)}
        />
        <div
          className={cn(
            // Resting state is `translate: none`, never translate-x-0: any translate
            // makes this the containing block for fixed children, and the ⌘K
            // palette and dialogs opened from the sidebar would be boxed inside it.
            "fixed inset-y-0 left-0 z-50 flex h-dvh w-60 shrink-0 flex-col transition-[translate,visibility] ease-[var(--ease-drawer)] md:visible md:static md:h-auto md:translate-none md:transition-none",
            navOpen
              ? "translate-none shadow-xl duration-300 md:shadow-none"
              : "invisible -translate-x-full duration-200",
          )}
        >
          <AppSidebar displayName={displayName} onNavigate={() => setNavOpen(false)} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 items-center gap-2 border-b bg-background px-3 md:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label="Open navigation"
              onClick={() => setNavOpen(true)}
            >
              {navOpen ? <X /> : <Menu />}
            </Button>
            <Logo variant="horizontal" className="h-5 w-auto" />
          </header>
          {/* Remount on namespace switch: selections, drafts and forms belong to one
              namespace and must never carry over into another. */}
          <main key={namespace} className="min-h-0 min-w-0 flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </UnsavedProvider>
  );
}
