"use client";

import {
  Activity,
  KeyRound,
  LayoutDashboard,
  Moon,
  Search,
  Settings as SettingsIcon,
  Shield,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { useTheme } from "@/components/theme";
import { useMounts } from "@/lib/kv";
import { secretsHref } from "@/lib/secrets-href";

type Command = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
};

export function CommandPalette() {
  const router = useRouter();
  const { toggle } = useTheme();
  const { data: mounts } = useMounts();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  // global ⌘K / Ctrl+K
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const go = React.useCallback(
    (href: string) => () => {
      router.push(href);
      setOpen(false);
    },
    [router],
  );

  const commands = React.useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: "overview", label: "Overview", icon: <LayoutDashboard />, run: go("/") },
      { id: "secrets", label: "Secrets", icon: <KeyRound />, run: go("/secrets") },
      { id: "policies", label: "Access · Policies", icon: <Shield />, run: go("/access") },
      { id: "auth", label: "Access · Auth Methods", icon: <Shield />, run: go("/access/auth") },
      { id: "identity", label: "Access · Identity", icon: <Shield />, run: go("/access/identity") },
      { id: "mfa", label: "Access · MFA", icon: <Shield />, run: go("/access/mfa") },
      { id: "capabilities", label: "Access · Capabilities", icon: <Shield />, run: go("/access/capabilities") },
      { id: "tokens", label: "Access · Tokens", icon: <Shield />, run: go("/access/tokens") },
      { id: "leases", label: "Access · Leases", icon: <Shield />, run: go("/access/leases") },
      { id: "ops-status", label: "Operations · Status", icon: <Activity />, run: go("/operations") },
      { id: "ops-audit", label: "Operations · Audit", icon: <Activity />, run: go("/operations/audit") },
      { id: "ops-quotas", label: "Operations · Quotas", icon: <Activity />, run: go("/operations/quotas") },
      { id: "ops-plugins", label: "Operations · Plugins", icon: <Activity />, run: go("/operations/plugins") },
      { id: "settings", label: "Settings · Profile", icon: <SettingsIcon />, run: go("/settings") },
      { id: "settings-prefs", label: "Settings · Preferences", icon: <SettingsIcon />, run: go("/settings/preferences") },
      { id: "settings-ns", label: "Settings · Namespaces", icon: <SettingsIcon />, run: go("/settings/namespaces") },
      { id: "theme", label: "Toggle dark mode", icon: <Moon />, run: () => { toggle(); setOpen(false); } },
    ];
    const kvMounts = Object.keys(mounts ?? {}).map((path) => {
      const name = path.replace(/\/$/, "");
      return {
        id: `mount-${name}`,
        label: `Open engine ${path}`,
        hint: "secrets",
        icon: <KeyRound />,
        run: go(secretsHref(name)),
      } satisfies Command;
    });
    return [...nav, ...kvMounts];
  }, [go, toggle, mounts]);

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  );

  // Arrow keys can walk past the fold; keep the highlighted row in view.
  const listRef = React.useRef<HTMLUListElement>(null);
  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.run();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border bg-muted px-1.5 font-sans text-[10px] font-medium">⌘K</kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/40 p-4 pt-[15vh] backdrop-blur-sm duration-100 ease-out animate-in fade-in-0"
          onClick={() => setOpen(false)}
        >
          {/* Summoned by ⌘K many times a day: it should just be there, not zoom in. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="w-full max-w-xl overflow-hidden rounded-2xl border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="size-4 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Jump to…"
                aria-label="Jump to"
                className="h-11 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
            <ul ref={listRef} className="max-h-80 overflow-auto p-2">
              {filtered.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No matches
                </li>
              ) : (
                filtered.map((c, i) => (
                  <li key={c.id}>
                    <button
                      data-index={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={c.run}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm [&_svg]:size-4 ${
                        i === active
                          ? "bg-primary/10 text-primary [&_svg]:text-primary"
                          : "[&_svg]:text-muted-foreground"
                      }`}
                    >
                      {c.icon}
                      <span className="flex-1">{c.label}</span>
                      {c.hint ? (
                        <span className="text-xs text-muted-foreground">
                          {c.hint}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
