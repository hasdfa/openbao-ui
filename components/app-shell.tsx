"use client";

import { Menu, X } from "lucide-react";
import * as React from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppShell({
  displayName,
  children,
}: {
  displayName: string;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = React.useState(false);

  React.useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNavOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="flex min-h-dvh">
      {navOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-foreground/40 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <div
        className={cn(
          "z-50 w-60 shrink-0 flex-col",
          navOpen
            ? "fixed inset-y-0 left-0 flex h-dvh md:static md:h-auto"
            : "hidden md:flex",
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
        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
