"use client";

import { Activity, BookOpen, ExternalLink, KeyRound, LayoutDashboard, Settings, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CommandPalette } from "@/components/command-palette";
import { Logo } from "@/components/logo";
import { NamespaceSwitcher } from "@/components/namespace-switcher";
import { SessionBar } from "@/components/session-bar";
import { ThemeToggle } from "@/components/theme";
import { useCan } from "@/lib/acl";
import { BASE_PATH } from "@/lib/base-path";
import { cn } from "@/lib/utils";

const SidebarVariant = {
  Desktop: "desktop",
  Mobile: "mobile",
} as const;

type SidebarVariant = (typeof SidebarVariant)[keyof typeof SidebarVariant];

export function AppSidebar({
  displayName,
  variant = SidebarVariant.Desktop,
  onNavigate,
  onClose,
}: {
  displayName: string;
  variant?: SidebarVariant;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const rel = pathname.replace(new RegExp(`^${BASE_PATH}`), "") || "/";
  const can = useCan();

  // capability-aware: hide what the token can't use (Access stays — the
  // Capabilities tester always works on your own token)
  // land on the first Access tab the token can actually use
  const accessHref = can("sys/policies/acl") ? "/access" : "/access/capabilities";
  const nav = [
    { href: "/", label: "Overview", icon: LayoutDashboard, show: true },
    { href: "/secrets", label: "Secrets", icon: KeyRound, show: can("sys/mounts") },
    { href: "/guides", label: "Guides", icon: BookOpen, show: can("sys/mounts") },
    { href: accessHref, label: "Access", icon: Users, show: true },
    { href: "/operations", label: "Operations", icon: Activity, show: can("sys/audit") },
    { href: "/settings", label: "Settings", icon: Settings, show: true },
  ].filter((n) => n.show);

  return (
    <aside className={cn("flex w-60 shrink-0 flex-col border-r bg-sidebar", variant === SidebarVariant.Mobile ? "h-full w-full border-0" : "hidden md:flex")}>
      <div className="flex h-14 items-center justify-between gap-2 border-b px-4">
        <Logo variant="horizontal" className="h-6 w-auto" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {variant === SidebarVariant.Mobile && onClose ? (
            <button
              type="button"
              aria-label="Close navigation"
              onClick={onClose}
              className="rounded-md p-2 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 border-b p-3">
        <NamespaceSwitcher />
        <CommandPalette />
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? rel === "/" : rel.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "group/nav flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 transition-colors",
                  active ? "text-primary" : "text-muted-foreground group-hover/nav:text-foreground",
                )}
              />
              {label}
            </Link>
          );
        })}

        {/* Escape the basePath with a plain <a> so this points at OpenBao's
            stock UI (/ui) rather than /ui2/ui. */}
        <a
          href="/ui"
          onClick={onNavigate}
          className="group/nav flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground transition-all duration-150 hover:bg-sidebar-accent hover:text-foreground"
        >
          <ExternalLink className="size-4 text-muted-foreground transition-colors group-hover/nav:text-foreground" />
          Classic UI
        </a>
      </nav>

      <SessionBar displayName={displayName} />
    </aside>
  );
}
