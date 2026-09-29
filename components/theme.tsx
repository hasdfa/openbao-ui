"use client";

import { Moon, Sun } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ThemePref = "light" | "dark" | "system";

const ThemeContext = React.createContext<{
  theme: ThemePref;
  resolved: "light" | "dark";
  setTheme: (t: ThemePref) => void;
  toggle: () => void;
} | null>(null);

// Inline script (run before paint) that applies the saved theme — treats a
// missing or "system" preference as the OS preference — to avoid a flash.
export const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

const systemDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemePref>("system");
  // Start deterministic ("light") so the server render and the first client
  // render match — otherwise a stored "dark" theme makes the toggle icon (and
  // any resolved-theme-dependent UI) hydrate mismatched (React #418). The effect
  // below immediately corrects it from the inline-applied <html> class.
  const [resolved, setResolved] = React.useState<"light" | "dark">("light");

  // load the stored preference once on mount
  React.useEffect(() => {
    const stored = localStorage.getItem("theme") as ThemePref | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeState(stored);
    }
  }, []);

  // apply the resolved theme, and track OS changes while on "system"
  React.useEffect(() => {
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && systemDark());
      document.documentElement.classList.toggle("dark", dark);
      setResolved(dark ? "dark" : "light");
    };
    apply();
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);

  const setTheme = React.useCallback((t: ThemePref) => {
    localStorage.setItem("theme", t);
    setThemeState(t);
  }, []);

  const toggle = React.useCallback(
    () => setTheme(resolved === "dark" ? "light" : "dark"),
    [resolved, setTheme],
  );

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

const ICON = "transition-[opacity,transform] duration-300 ease-out";

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const dark = resolved === "dark";
  const label = dark ? "Switch to light" : "Switch to dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={label}
      aria-label={label}
    >
      {/* The outgoing icon turns away as the new one turns in. */}
      <span className="relative inline-flex">
        <Sun className={cn(ICON, dark ? "rotate-0" : "-rotate-90 scale-50 opacity-0")} />
        <Moon className={cn(ICON, "absolute inset-0", dark ? "rotate-90 scale-50 opacity-0" : "rotate-0")} />
      </span>
    </Button>
  );
}
