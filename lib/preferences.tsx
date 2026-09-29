"use client";

import * as React from "react";

// Client-side UI preferences (no server interaction), persisted per-browser.
export type Preferences = {
  revealSecrets: boolean; // show KV/cubbyhole values un-masked by default
  editorMode: "kv" | "dotenv" | "yaml" | "json"; // default secret editor
  toastDurationMs: number; // how long toasts stay
  auditRefreshMs: number; // audit-log auto-refresh interval
};

export const DEFAULT_PREFERENCES: Preferences = {
  revealSecrets: false,
  editorMode: "kv",
  toastDurationMs: 4000,
  auditRefreshMs: 10000,
};

const STORAGE_KEY = "openbao_prefs";

type Ctx = {
  prefs: Preferences;
  setPref: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  reset: () => void;
};

const PreferencesContext = React.createContext<Ctx | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = React.useState<Preferences>(DEFAULT_PREFERENCES);

  // hydrate from localStorage after mount (avoids SSR mismatch)
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPrefs({ ...DEFAULT_PREFERENCES, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);

  const persist = React.useCallback((next: Preferences) => {
    setPrefs(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const setPref = React.useCallback<Ctx["setPref"]>(
    (key, value) => setPrefs((p) => {
      const next = { ...p, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    }),
    [],
  );

  const reset = React.useCallback(() => persist(DEFAULT_PREFERENCES), [persist]);

  return (
    <PreferencesContext.Provider value={{ prefs, setPref, reset }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = React.useContext(PreferencesContext);
  if (!ctx)
    throw new Error("usePreferences must be used within <PreferencesProvider>");
  return ctx;
}
