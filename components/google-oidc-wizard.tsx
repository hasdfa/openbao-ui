"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, Trash2, X } from "lucide-react";
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
  DEFAULT_POLICY,
  addDomain,
  displayTeamRole,
  planGoogleOidcRoles,
  ssoGroupName,
  type DomainRoleRow,
} from "@/lib/oidc-domains";
import { DEFAULT_ROLE_TEMPLATES } from "@/lib/role-defaults";
import { useRoleTemplates } from "@/lib/roles";
import { oidcCallbackUrl, useSetUiConfig, useUiConfig } from "@/lib/ui-config";

const GOOGLE_DISCOVERY = "https://accounts.google.com";

const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : e instanceof Error ? e.message : "Something went wrong";

const selectClass =
  "h-9 w-full rounded-md border bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
  const [restrict, setRestrict] = React.useState(true);
  const [domains, setDomains] = React.useState<string[]>([]);
  const [defaultTeamRole, setDefaultTeamRole] = React.useState("viewer");
  const [domainRoles, setDomainRoles] = React.useState<DomainRoleRow[]>([]);
  const [mount, setMount] = React.useState("oidc");
  const [oidcRoleName, setOidcRoleName] = React.useState("default");
  const [makeDefault, setMakeDefault] = React.useState(true);

  const [busy, setBusy] = React.useState(false);
  const [step, setStep] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [doneSummary, setDoneSummary] = React.useState("");

  const knownRoles = React.useMemo(() => {
    const names = new Set<string>();
    for (const t of DEFAULT_ROLE_TEMPLATES) names.add(t.name);
    for (const t of templates.data ?? []) names.add(t.name);
    for (const r of accessRoles.data ?? []) names.add(r.name);
    return [...names].sort();
  }, [templates.data, accessRoles.data]);

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
        oidcRoleName,
        defaultTeamRole,
        restrict,
        allowedDomains: domains,
        domainRoles,
        redirectUri,
      });
    } catch (err) {
      setError(errMsg(err));
      return;
    }
    setBusy(true);
    try {
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

      setStep("Configuring the Google provider…");
      await baoFetch({
        path: `auth/${m}/config`,
        method: "POST",
        namespace,
        body: {
          oidc_discovery_url: GOOGLE_DISCOVERY,
          oidc_client_id: clientId.trim(),
          oidc_client_secret: clientSecret.trim(),
          default_role: plan.defaultOidcRole,
        },
      });

      for (const planned of plan.roles) {
        setStep(`Creating sign-in role ${planned.name}…`);
        await baoFetch({
          path: `auth/${m}/role/${planned.name}`,
          method: "POST",
          namespace,
          body: planned.body,
        });
      }

      for (const teamRole of plan.teamRolesToEnsure) {
        setStep(`Ensuring Team role ${teamRole}…`);
        await ensureTeamRole({
          teamRole,
          namespace,
          templates: templates.data ?? DEFAULT_ROLE_TEMPLATES,
          accessRoles: accessRoles.data ?? [],
        });
      }

      if (plan.ssoAliases.length > 0) {
        setStep("Linking domains to Team roles…");
        const accessor = await oidcAccessor(m, namespace);
        for (const alias of plan.ssoAliases) {
          const groupId = await ensureSsoGroup(alias.teamRole, namespace);
          await ensureGroupAlias({
            name: alias.name,
            groupId,
            accessor,
            namespace,
          });
        }
      }

      setStep("Showing it on the login page…");
      await baoFetch({
        path: `sys/auth/${m}/tune`,
        method: "POST",
        namespace,
        body: { listing_visibility: "unauth", description: "Sign in with Google" },
      });

      setStep("Saving UI preferences…");
      await setUiConfig.mutateAsync({
        ...(makeDefault ? { defaultLoginMethod: m } : {}),
        oidcDomainRoles: {
          mount: m,
          roles: plan.domainRoutes,
          fallbackRole: plan.fallbackRole,
        },
      });

      qc.invalidateQueries({ queryKey: ["auth-methods", namespace] });
      qc.invalidateQueries({ queryKey: ["groups", namespace] });
      qc.invalidateQueries({ queryKey: ["groups-detailed", namespace] });
      setDoneSummary(summarizePlan(defaultTeamRole, restrict, domains, domainRoles));
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
            <div>{doneSummary}</div>
          </div>
          <div className="flex justify-end">
            <Button onClick={onDone}>Done</Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} className="max-h-[min(90dvh,calc(100dvh-2rem))] max-w-xl overflow-y-auto">
      <div className="sticky -top-6 z-10 -mx-6 mb-4 border-b bg-card px-6 pb-4 pt-6">
        <DialogHeader
          title="Set up Google sign-in"
          description="Paste the Google OAuth client, then choose who can join and which Team role they get."
          onClose={onClose}
        />
      </div>
      <form className="flex flex-col gap-5" onSubmit={submit}>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 text-xs">
          <span className="shrink-0 text-muted-foreground">Redirect URI</span>
          <code className="min-w-0 flex-1 truncate">{redirectUri}</code>
        </div>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Google app</h3>
          <Field label="Client ID">
            <Input value={clientId} onChange={(e) => setClientId(e.target.value)} className="font-mono" autoFocus />
          </Field>
          <Field label="Client secret">
            <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} className="font-mono" />
          </Field>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">Who can join</h3>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="who"
              className="mt-1"
              checked={!restrict}
              onChange={() => setRestrict(false)}
            />
            <span>
              Anyone with a Google account
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Includes personal Gmail.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="who"
              className="mt-1"
              checked={restrict}
              onChange={() => setRestrict(true)}
            />
            <span>
              Only these email domains
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Unknown domains are rejected.
              </span>
            </span>
          </label>
          {restrict ? (
            <DomainChips
              domains={domains}
              onChange={setDomains}
              onError={setError}
            />
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">When they join</h3>
          <Field
            label="Default role"
            htmlFor="google-default-role"
            hint="Granted on every Google sign-in. You can still change it later on Team."
          >
            <RoleSelect
              value={defaultTeamRole}
              roles={knownRoles}
              onChange={setDefaultTeamRole}
              id="google-default-role"
            />
          </Field>

          <Disclosure label="Different role by domain" count={domainRoles.length || undefined}>
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">
                People from a domain get this role instead of the default.
              </p>
              {domainRoles.map((row, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`oidc-domain-${i}`}>Domain</Label>
                    <Input
                      id={`oidc-domain-${i}`}
                      value={row.domain}
                      onChange={(e) =>
                        setDomainRoles((rows) =>
                          rows.map((r, j) => (j === i ? { ...r, domain: e.target.value } : r)),
                        )
                      }
                      className="font-mono"
                      placeholder="acme.com"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`oidc-role-${i}`}>Role</Label>
                    <RoleSelect
                      id={`oidc-role-${i}`}
                      value={row.teamRole}
                      roles={knownRoles}
                      onChange={(teamRole) =>
                        setDomainRoles((rows) =>
                          rows.map((r, j) => (j === i ? { ...r, teamRole } : r)),
                        )
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0 md:size-9"
                    aria-label={`Remove ${row.domain || `domain ${i + 1}`}`}
                    onClick={() => setDomainRoles((rows) => rows.filter((_, j) => j !== i))}
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
                onClick={() =>
                  setDomainRoles((rows) => [...rows, { domain: "", teamRole: defaultTeamRole }])
                }
              >
                <Plus /> Add domain
              </Button>
            </div>
          </Disclosure>
        </section>

        <Disclosure label="Advanced">
          <div className="flex flex-col gap-3">
            <Field label="Mount path">
              <Input value={mount} onChange={(e) => setMount(e.target.value)} className="font-mono" />
            </Field>
            <Field label="OIDC role name">
              <Input value={oidcRoleName} onChange={(e) => setOidcRoleName(e.target.value)} className="font-mono" />
            </Field>
          </div>
        </Disclosure>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
          Make Google the default sign-in method
        </label>

        {step ? <p className="text-sm text-muted-foreground">{step}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="sticky -bottom-6 -mx-6 mt-2 flex justify-end gap-2 border-t bg-card px-6 py-4">
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

function RoleSelect({
  id,
  value,
  roles,
  onChange,
}: {
  id?: string;
  value: string;
  roles: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      <option value={DEFAULT_POLICY}>No extra role (default policy)</option>
      {roles.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

function DomainChips({
  domains,
  onChange,
  onError,
}: {
  domains: string[];
  onChange: (next: string[]) => void;
  onError: (msg: string | null) => void;
}) {
  const [draft, setDraft] = React.useState("");

  function commit(raw: string) {
    const value = raw.trim();
    if (!value) return;
    try {
      onChange(value.split(/[,\s]+/).reduce((list, part) => addDomain(list, part), domains));
      setDraft("");
      onError(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Invalid domain");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5">
        {domains.map((domain) => (
          <span
            key={domain}
            className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 font-mono text-xs"
          >
            {domain}
            <button
              type="button"
              aria-label={`Remove ${domain}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onChange(domains.filter((d) => d !== domain))}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          aria-label="Add email domain"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            }
            if (e.key === "Backspace" && !draft && domains.length) {
              onChange(domains.slice(0, -1));
            }
          }}
          onBlur={() => commit(draft)}
          placeholder={domains.length ? "Add another…" : "acme.com"}
          className="min-w-[8rem] flex-1 bg-transparent py-1 font-mono text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <p className="text-xs text-muted-foreground">Type a domain and press Enter.</p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function summarizePlan(
  defaultTeamRole: string,
  restrict: boolean,
  domains: string[],
  domainRoles: DomainRoleRow[],
): string {
  const who = restrict
    ? `Only ${domains.length ? domains.join(", ") : "the domains you listed"} can join.`
    : "Anyone with a Google account can join.";
  const def =
    defaultTeamRole === DEFAULT_POLICY
      ? "They get the default policy."
      : `They get the ${displayTeamRole(defaultTeamRole)} role.`;
  const extras = domainRoles
    .filter((r) => r.domain.trim())
    .map((r) => `${r.domain.trim()} → ${displayTeamRole(r.teamRole)}`)
    .join("; ");
  return extras ? `${who} ${def} Exceptions: ${extras}.` : `${who} ${def}`;
}

async function ensureTeamRole({
  teamRole,
  namespace,
  templates,
  accessRoles,
}: {
  teamRole: string;
  namespace: string;
  templates: { name: string; policy: string }[];
  accessRoles: { name: string }[];
}) {
  const tpl = templates.find((t) => t.name === teamRole);
  if (tpl) {
    await baoFetch({
      path: `sys/policies/acl/${tpl.name}`,
      method: "POST",
      namespace,
      body: { policy: tpl.policy },
    });
  } else if (!accessRoles.some((r) => r.name === teamRole)) {
    // Scoped roles are applied from Team; a custom name is used as a policy
    // reference. OpenBao ignores unknown policy names on the token.
  }
  try {
    await baoFetch({
      path: "identity/group",
      method: "POST",
      namespace,
      body: { name: teamRole, type: "internal", policies: [teamRole] },
    });
  } catch (err) {
    if (!(err instanceof BaoError && /already exists/i.test(err.errors.join(" ")))) throw err;
  }
}

async function ensureSsoGroup(teamRole: string, namespace: string): Promise<string> {
  const name = ssoGroupName(teamRole);
  try {
    await baoFetch({
      path: "identity/group",
      method: "POST",
      namespace,
      body: {
        name,
        type: "external",
        policies: [teamRole],
        metadata: { sso: "google", role: teamRole },
      },
    });
  } catch (err) {
    if (!(err instanceof BaoError && /already exists/i.test(err.errors.join(" ")))) throw err;
  }
  const res = await baoFetch<{ data: { id: string } }>({
    path: `identity/group/name/${encodeURIComponent(name)}`,
    namespace,
  });
  return res.data.id;
}

async function oidcAccessor(mount: string, namespace: string): Promise<string> {
  const res = await baoFetch<{
    data: Record<string, { accessor?: string }>;
  }>({ path: "sys/auth", namespace });
  const keyed = res.data[`${mount}/`] ?? res.data[mount];
  const accessor = keyed?.accessor;
  if (!accessor) throw new Error("Could not read the OIDC mount accessor");
  return accessor;
}

async function ensureGroupAlias({
  name,
  groupId,
  accessor,
  namespace,
}: {
  name: string;
  groupId: string;
  accessor: string;
  namespace: string;
}) {
  try {
    await baoFetch({
      path: "identity/group-alias",
      method: "POST",
      namespace,
      body: { name, canonical_id: groupId, mount_accessor: accessor },
    });
    return;
  } catch (err) {
    if (!(err instanceof BaoError && /already exists|in use/i.test(err.errors.join(" ")))) {
      throw err;
    }
  }
  let ids: string[] = [];
  try {
    const listed = await baoFetch<{ data: { keys?: string[] } }>({
      path: "identity/group-alias/id",
      namespace,
      list: true,
    });
    ids = listed.data?.keys ?? [];
  } catch {
    return;
  }
  for (const id of ids.slice(0, 200)) {
    try {
      const row = await baoFetch<{
        data: { name?: string; mount_accessor?: string };
      }>({ path: `identity/group-alias/id/${id}`, namespace });
      if (row.data?.name === name && row.data.mount_accessor === accessor) {
        await baoFetch({
          path: `identity/group-alias/id/${id}`,
          method: "POST",
          namespace,
          body: { canonical_id: groupId },
        });
        return;
      }
    } catch {
      // keep scanning
    }
  }
}
