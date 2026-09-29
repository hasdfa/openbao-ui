"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUiConfig, useSetUiConfig } from "@/lib/ui-config";

// Login-page customization, stored in the BFF UI-config store and read by the
// (unauthenticated) login page. Operator-only writes are enforced server-side.
export default function LoginSettingsPage() {
  const { data: cfg, isLoading } = useUiConfig();
  const save = useSetUiConfig();

  const [title, setTitle] = React.useState("");
  const [subtitle, setSubtitle] = React.useState("");
  const [logoUrl, setLogoUrl] = React.useState("");
  const [accent, setAccent] = React.useState("");
  const [defaultMethod, setDefaultMethod] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!cfg) return;
    setTitle(cfg.branding?.title ?? "");
    setSubtitle(cfg.branding?.subtitle ?? "");
    setLogoUrl(cfg.branding?.logoUrl ?? "");
    setAccent(cfg.branding?.accent ?? "");
    setDefaultMethod(cfg.defaultLoginMethod ?? "");
  }, [cfg]);

  return (
    <div className="max-w-2xl px-4 py-6 md:px-8">
      <h2 className="text-lg font-semibold">Login page</h2>
      <p className="mb-5 text-sm text-muted-foreground">
        Brand the sign-in screen and choose the default method. The login page
        lists any auth method tuned with <span className="font-mono">listing_visibility=unauth</span>{" "}
        (see Access → Auth Methods, or run the Google sign-in setup).
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <form
          className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaved(false);
            await save.mutateAsync({
              branding: {
                title: title.trim() || undefined,
                subtitle: subtitle.trim() || undefined,
                logoUrl: logoUrl.trim() || undefined,
                accent: accent.trim() || undefined,
              },
              defaultLoginMethod: defaultMethod.trim() || undefined,
            });
            setSaved(true);
          }}
        >
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sign in to OpenBao" />
          </Field>
          <Field label="Subtitle">
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Authenticate to manage your secrets." />
          </Field>
          <div className="flex gap-3">
            <Field label="Logo URL">
              <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="font-mono" placeholder="https://…/logo.svg" />
            </Field>
            <div className="flex flex-col gap-2">
              <Label>Accent</Label>
              <input
                type="color"
                value={accent || "#000000"}
                onChange={(e) => setAccent(e.target.value)}
                className="h-9 w-16 cursor-pointer rounded-md border bg-transparent"
                aria-label="Accent color"
              />
            </div>
          </div>
          <Field label="Default login method (auth mount path)">
            <Input value={defaultMethod} onChange={(e) => setDefaultMethod(e.target.value)} className="font-mono" placeholder="oidc" />
          </Field>

          <div className="flex items-center gap-3 border-t pt-4">
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            {accent ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setAccent("")}>
                Clear accent
              </Button>
            ) : null}
            {saved ? <span className="text-xs text-emerald-600">Saved</span> : null}
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
