"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BASE_PATH } from "@/lib/base-path";
import { cn } from "@/lib/utils";

// Underline tab bar shared by the Access / Operations / Settings sections.
// The active indicator is an inset rounded bar that sits on the header border.
export function SectionTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const rel = pathname.replace(new RegExp(`^${BASE_PATH}`), "") || "/";

  return (
    <nav className="min-w-0 -mb-px flex gap-1 overflow-x-auto pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => {
        const active = rel === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "relative whitespace-nowrap rounded-t-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {t.label}
            {active ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
