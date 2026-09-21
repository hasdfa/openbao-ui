"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccessRoles } from "@/lib/access-roles";
import { baoFetch, BaoError } from "@/lib/bao-client";
import { useNamespace } from "@/lib/namespace";
import {
  planGoogleOidcRoles,
  type DomainPolicyRow,
} from "@/lib/oidc-domains";
import { useRoleTemplates } from "@/lib/roles";
import { oidcCallbackUrl, useSetUiConfig, useUiConfig } from "@/lib/ui-config";

// One-click-ish setup for "Sign in with Google" on top of OpenBao's native
// OIDC method. Composes the primitives: enable the mount, write provider config
// (Google discovery), create JIT role(s) wired to this app's callback — optionally
// bound to email domains with per-domain token policies — surface the method on
// the login page (listing_visibility=unauth), and record it as the default
// login method in the UI config.
const GOOGLE_DISCOVERY = "https://accounts.google.com";

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : e instanceof Error ? e.message : "Something went wrong";

export function GoogleOidcWizard({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { namespace } = useNamespace();
  const setUiConfig = useSetUiConfig();
  const uiConfig = useUiConfig();
  const qc = useQueryClient();
  const templates = useRoleTemplates();
  const accessRoles = useAccessRoles();

  const [clientId, setClientId] = React.useState("");
  const [clientSecret, setClientSecret] = React.useState("");
  const [policies, setPolicies] = React.useState("default");
  const [allowedDomains, setAllowedDomains] = React.useState("");
  const [domainPolicies, setDomainPolicies] = React.useState<DomainPolicyRow[]>([]);
  const [mount, setMount] = React.useState("oidc");
  const [role, setRole] = React.useState("default");
  const [groupsClaim, setGroupsClaim] = React.useState("");
  const [makeDefault, setMakeDefault] = React.useState(true);

  const [busy, setBusy] = React.useState(false);
  const [step, setStep] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const knownRoles = React.useMemo(() => {
    const names = new Set<string>();
    for (const t of templates.data ?? []) names.add(t.name);
    for (const r of accessRoles.data ?? []) names.add(r.name);
    return [...names].sort();
  }, [templates.data, accessRoles.data]);

  // Prefer the OPENBAO_UI_PUBLIC_URL override (if configured) so the role's
  // allowed_redirect_uris matches the redirect_uri the login route will send.
  const redirectUri = oidcCallbackUrl(uiConfig.data?.publicUrl);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clientId.trim() || !clientSecret.trim()) {
      setError("Client ID and secret are required");
      return;
    }
    const m = mount.trim().replace(/\/$/, "") || "oidc";
    let plan;
    try {
      plan = planGoogleOidcRoles({
        role,
        policies,
        allowedDomains,
        domainPolicies,
        groupsClaim,
        redirectUri,
      });
    } catch (err) {
      setError(errMsg(err));
      return;
    }
    setBusy(true);
    try {
      // 1. enable the OIDC auth mount (ignore "already in use")
      setStep("Enabling the OIDC method…");
      try {
        await baoFetch({
          path: `sys/auth/${m}`,
          method: "POST",
          namespace,
          body: { type: "oidc", description: "Sign in with Google" },
        });
      } catch (err) {
        if (!(err instanceof BaoError && /already in use|path is already/i.test(err.errors.join(" ")))) {
          throw err;
        }
      }

      // 2. provider config (Google discovery). OpenBao validates the discovery
      //    URL here, so this step needs outbound access to accounts.google.com.
      setStep("Configuring the Google provider…");
      await baoFetch({
        path: `auth/${m}/config`,
        method: "POST",
        namespace,
        body: {
          oidc_discovery_url: GOOGLE_DISCOVERY,
          oidc_client_id: clientId.trim(),
          oidc_client_secret: clientSecret.trim(),
          default_role: plan.defaultRole,
        },
      });

      // 3. JIT role(s) — OpenBao bound_claims on email are the allowlist.
      for (const planned of plan.roles) {
        setStep(`Creating sign-in role ${planned.name}…`);
        await baoFetch({
          path: `auth/${m}/role/${planned.name}`,
          method: "POST",
          namespace,
          body: planned.body,
        });
      }

      // 4. surface it on the (unauthenticated) login page
      setStep("Showing it on the login page…");
      await baoFetch({
        path: `sys/auth/${m}/tune`,
        method: "POST",
        namespace,
        body: { listing_visibility: "unauth", description: "Sign in with Google" },
      });

      // 5. record default method + domain→role login hint (OpenBao still
      //    enforces bound_claims; an empty list clears a previous restriction).
      setStep("Saving UI preferences…");
      await setUiConfig.mutateAsync({
        ...(makeDefault ? { defaultLoginMethod: m } : {}),
        oidcDomainRoles: { mount: m, roles: plan.domainRoutes },
      });

      qc.invalidateQueries({ queryKey: ["auth-methods", namespace] });
      setStep(null);
      setDone(true);
    } catch (err) {
      setError(errMsg(err));
      setStep(null);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Dialog open onClose={onDone}>
        <DialogHeader title="Google sign-in is ready" onClose={onDone} />
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-md border bg-emerald-500/10 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div>
              Users can now choose <strong>Sign in with Google</strong> on the login
              page. Access is the token policies on the OIDC role
              {allowedDomains.trim() || domainPolicies.some((r) => r.domain.trim())
                ? "; emails outside the allowed domains are rejected by OpenBao"
                : ""}
              .
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={onDone}>Done</Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} className="max-w-lg">
      <DialogHeader
        title="Set up Google sign-in"
        description="Create a Google OAuth client (Authorized redirect URI below), then paste its credentials here."
        onClose={onClose}
      />
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 text-xs">
          <span className="shrink-0 text-muted-foreground">Redirect URI</span>
          <code className="min-w-0 flex-1 truncate">{redirectUri}</code>
        </div>

        <Field label="Client ID">
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} className="font-mono" autoFocus />
        </Field>
        <Field label="Client secret">
          <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} className="font-mono" />
        </Field>
        <Field
          label="Allowed email domains"
          hint="Only Google accounts at these domains can sign in. Empty allows any Google account."
        >
          <Input
            value={allowedDomains}
            onChange={(e) => setAllowedDomains(e.target.value)}
            className="font-mono"
            placeholder="acme.com, vendor.io"
          />
        </Field>
        <Field
          label="Token policies (comma-separated)"
          hint="Granted on every Google sign-in for domains without a row below. Use an existing policy or team role name."
        >
          <Input value={policies} onChange={(e) => setPolicies(e.target.value)} className="font-mono" placeholder="default" />
        </Field>

        <Disclosure label="Different policies per domain" count={domainPolicies.length || undefined}>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Each row becomes its own OpenBao OIDC role. Sign-in asks for work
              email first when more than one role exists. Unknown domains are rejected.
            </p>
            {domainPolicies.map((row, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`oidc-domain-${i}`}>Domain</Label>
                  <Input
                    id={`oidc-domain-${i}`}
                    value={row.domain}
                    onChange={(e) =>
                      setDomainPolicies((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, domain: e.target.value } : r)),
                      )
                    }
                    className="font-mono"
                    placeholder="acme.com"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`oidc-policies-${i}`}>Policies</Label>
                  <Input
                    id={`oidc-policies-${i}`}
                    value={row.policies}
                    onChange={(e) =>
                      setDomainPolicies((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, policies: e.target.value } : r)),
                      )
                    }
                    className="font-mono"
                    placeholder="default"
                  />
                </div>
                {knownRoles.length > 0 ? (
                  <select
                    aria-label={`Team role for domain ${i + 1}`}
                    className="h-9 rounded-md border bg-transparent px-2 text-sm"
                    value=""
                    onChange={(e) => {
                      const name = e.target.value;
                      if (!name) return;
                      setDomainPolicies((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, policies: name } : r)),
                      );
                    }}
                  >
                    <option value="">Team role…</option>
                    {knownRoles.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0 md:size-9"
                  aria-label={`Remove domain ${row.domain || i + 1}`}
                  onClick={() => setDomainPolicies((rows) => rows.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setDomainPolicies((rows) => [...rows, { domain: "", policies: policies || "default" }])}
            >
              <Plus /> Add domain
            </Button>
          </div>
        </Disclosure>

        <Disclosure label="Advanced">
          <div className="flex flex-col gap-3">
            <Field label="Mount path">
              <Input value={mount} onChange={(e) => setMount(e.target.value)} className="font-mono" />
            </Field>
            <Field label="Role name">
              <Input value={role} onChange={(e) => setRole(e.target.value)} className="font-mono" />
            </Field>
            <Field label="Groups claim (optional)">
              <Input value={groupsClaim} onChange={(e) => setGroupsClaim(e.target.value)} className="font-mono" placeholder="groups" />
            </Field>
          </div>
        </Disclosure>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
          Make Google the default sign-in method
        </label>

        {step ? <p className="text-sm text-muted-foreground">{step}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Setting up…" : "Set up Google sign-in"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
