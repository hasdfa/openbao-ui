"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { ThemePref, useTheme } from "@/components/theme";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { usePreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { EDITOR_MODES } from "@/components/kv/kv-fields";

const THEME_OPTIONS: { value: ThemePref; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-4 shrink-0"
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-6">
      <h2 className="mb-4 text-sm font-medium">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export default function PreferencesPage() {
  const { theme, setTheme } = useTheme();
  const { prefs, setPref, reset } = usePreferences();

  function resetAll() {
    reset();
    try {
      localStorage.removeItem("theme");
      document.cookie = "bao_ns=; path=/; max-age=0";
    } catch {
      /* ignore */
    }
    location.reload();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4 px-4 py-6 md:px-8">
      <Section title="Theme">
        <p className="-mt-2 text-sm text-muted-foreground">
          &quot;System&quot; follows your OS setting.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors hover:bg-accent",
                theme === value ? "border-primary bg-accent font-medium" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Secrets">
        <Toggle
          label="Reveal values by default"
          description="Show secret values un-masked when opening a secret (instead of dots)."
          checked={prefs.revealSecrets}
          onChange={(v) => setPref("revealSecrets", v)}
        />
        <div className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium">Default editor</span>
            <span className="block text-sm text-muted-foreground">
              How the secret editor opens for new/edited secrets.
            </span>
          </span>
          <div className="flex gap-1 rounded-md border p-0.5">
            {EDITOR_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                aria-pressed={prefs.editorMode === m.value}
                onClick={() => setPref("editorMode", m.value)}
                className={cn(
                  "rounded px-3 py-1 text-sm",
                  prefs.editorMode === m.value ? "bg-accent font-medium" : "text-muted-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Notifications & refresh">
        <div className="flex items-center justify-between gap-4">
          <Label className="flex-1">Toast duration</Label>
          <select
            value={prefs.toastDurationMs}
            onChange={(e) => setPref("toastDurationMs", Number(e.target.value))}
            className="h-9 rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value={2000}>2 seconds</option>
            <option value={4000}>4 seconds</option>
            <option value={6000}>6 seconds</option>
            <option value={10000}>10 seconds</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label className="flex-1">Audit log refresh</Label>
          <select
            value={prefs.auditRefreshMs}
            onChange={(e) => setPref("auditRefreshMs", Number(e.target.value))}
            className="h-9 rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value={5000}>Every 5s</option>
            <option value={10000}>Every 10s</option>
            <option value={30000}>Every 30s</option>
            <option value={0}>Off</option>
          </select>
        </div>
      </Section>

      <Section title="Local data">
        <p className="-mt-2 text-sm text-muted-foreground">
          Preferences are stored only in your browser and don&apos;t affect your
          OpenBao session.
        </p>
        <Button variant="outline" size="sm" className="self-start" onClick={resetAll}>
          Reset local preferences
        </Button>
      </Section>
    </div>
  );
}
