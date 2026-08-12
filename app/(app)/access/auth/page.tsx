"use client";

import { Key, LogIn, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { GoogleOidcWizard } from "@/components/google-oidc-wizard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { BaoError } from "@/lib/bao-client";
import { oidcCallbackUrl, useUiConfig } from "@/lib/ui-config";
import {
  AuthMount,
  useApproleRoleId,
  useApproleRoles,
  useAuthConfig,
  useAuthMethods,
  useAuthRoles,
  useAuthTune,
  useCreateApproleRole,
  useCreateAuthRole,
  useCreateUserpassUser,
  useDeleteApproleRole,
  useDeleteAuthRole,
  useDeleteUserpassUser,
  useDisableAuth,
  useEnableAuth,
  useGenerateSecretId,
  useLdapConfig,
  useSetAuthConfig,
  useSetAuthTune,
  useSetLdapConfig,
  useUserpassUsers,
} from "@/lib/auth-methods";

const ENABLE_TYPES = ["userpass", "approle", "ldap", "jwt", "oidc", "cert", "kubernetes", "radius"];
const errMsg = (e: unknown) =>
  e instanceof BaoError ? e.errors.join(", ") : "Something went wrong";

export default function AuthMethodsPage() {
  const methods = useAuthMethods();
  const [selected, setSelected] = React.useState<AuthMount | null>(null);
  const [enabling, setEnabling] = React.useState(false);
  const [googleWizard, setGoogleWizard] = React.useState(false);
  const [disabling, setDisabling] = React.useState<AuthMount | null>(null);
  const disable = useDisableAuth();

  const current =
    methods.data?.find((m) => m.path === selected?.path) ?? null;

  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 overflow-auto border-r p-3">
        <Button size="sm" className="mb-2 w-full" onClick={() => setEnabling(true)}>
          <Plus /> Enable method
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="mb-2 w-full"
          onClick={() => setGoogleWizard(true)}
        >
          <LogIn /> Set up Google sign-in
        </Button>
        {methods.isLoading ? (
          <p className="p-2 text-sm text-muted-foreground">Loading…</p>
        ) : methods.isError ? (
          <p className="p-2 text-sm text-destructive">{errMsg(methods.error)}</p>
        ) : (
          <ul>
            {(methods.data ?? []).map((mth) => (
              <li
                key={mth.path}
                className={`group flex items-center gap-2 rounded-md pr-1 hover:bg-accent ${
                  current?.path === mth.path ? "bg-accent" : ""
                }`}
              >
                <button
                  onClick={() => setSelected(mth)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                >
                  <Key className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono">{mth.path}</span>
                    <span className="block text-xs text-muted-foreground">{mth.type}</span>
                  </span>
                </button>
                {mth.path !== "token/" ? (
                  <button
                    title="Disable"
                    onClick={() => setDisabling(mth)}
                    className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="min-w-0 flex-1 overflow-auto p-6">
        {!current ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select an auth method, or enable a new one.
          </div>
        ) : (
          <MethodConfig method={current} />
        )}
      </div>

      {enabling ? (
        <EnableDialog
          onClose={() => setEnabling(false)}
          onEnabled={(p) => {
            setEnabling(false);
            const found = methods.data?.find((m) => m.path === p);
            if (found) setSelected(found);
          }}
        />
      ) : null}

      {googleWizard ? (
        <GoogleOidcWizard
          onClose={() => setGoogleWizard(false)}
          onDone={() => {
            setGoogleWizard(false);
            methods.refetch();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!disabling}
        onClose={() => setDisabling(null)}
        onConfirm={async () => {
          await disable.mutateAsync(disabling!.path);
          if (selected?.path === disabling!.path) setSelected(null);
          setDisabling(null);
        }}
        title={`Disable ${disabling?.path}?`}
        description="Tokens issued via this method will stop working."
        confirmText={disabling?.path.replace(/\/$/, "")}
        confirmLabel="Disable method"
        pending={disable.isPending}
      />
    </div>
  );
}

function MethodConfig({ method }: { method: AuthMount }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h2 className="font-mono text-lg font-semibold">{method.path}</h2>
        <p className="text-sm text-muted-foreground">
          type <span className="font-medium text-foreground">{method.type}</span>
          {method.description ? ` · ${method.description}` : ""}
        </p>
        {method.accessor ? (
          <p className="font-mono text-xs text-muted-foreground">{method.accessor}</p>
        ) : null}
      </div>

      {/* type-specific config leads (the common task) */}
      {method.type === "userpass" ? (
        <UserpassConfig mount={method.path} />
      ) : method.type === "approle" ? (
        <ApproleConfig mount={method.path} />
      ) : method.type === "ldap" ? (
        <LdapConfigPane mount={method.path} />
      ) : FIELD_SPECS[method.type] ? (
        <GenericConfig mount={method.path} spec={FIELD_SPECS[method.type]} />
      ) : (
        <p className="text-sm text-muted-foreground">
          A dedicated configuration UI for <span className="font-mono">{method.type}</span> is on the
          roadmap. The method is enabled and usable via the API/CLI; you can still tune it below.
        </p>
      )}

      {/* tune applies to every method — kept behind a disclosure */}
      <TuneSection path={method.path} />
    </div>
  );
}

function TuneSection({ path }: { path: string }) {
  const tune = useAuthTune(path);
  const save = useSetAuthTune(path);
  const [description, setDescription] = React.useState("");
  const [def, setDef] = React.useState("");
  const [max, setMax] = React.useState("");
  const [listed, setListed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (tune.data) {
      setDescription(tune.data.description ?? "");
      setDef(String(tune.data.default_lease_ttl ?? ""));
      setMax(String(tune.data.max_lease_ttl ?? ""));
      setListed(tune.data.listing_visibility === "unauth");
    }
  }, [tune.data]);

  return (
    <Disclosure label="Tune (lease TTLs & description)">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setSaved(false);
          try {
            await save.mutateAsync({
              description,
              default_lease_ttl: def,
              max_lease_ttl: max,
              listing_visibility: listed ? "unauth" : "hidden",
            });
            setSaved(true);
          } catch (err) {
            setError(errMsg(err));
          }
        }}
      >
        <Field label="Description">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="flex gap-3">
          <Field label="Default lease TTL">
            <Input value={def} onChange={(e) => setDef(e.target.value)} placeholder="e.g. 768h or seconds" />
          </Field>
          <Field label="Max lease TTL">
            <Input value={max} onChange={(e) => setMax(e.target.value)} placeholder="e.g. 768h or seconds" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={listed}
            onChange={(e) => setListed(e.target.checked)}
          />
          Show this method on the login page (listing_visibility)
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save tune"}
          </Button>
          {saved ? <span className="text-xs text-emerald-600">Saved</span> : null}
        </div>
      </form>
    </Disclosure>
  );
}

function LdapConfigPane({ mount }: { mount: string }) {
  const cfg = useLdapConfig(mount);
  const save = useSetLdapConfig(mount);
  const [f, setF] = React.useState({ url: "", binddn: "", bindpass: "", userdn: "", groupdn: "" });
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  React.useEffect(() => {
    if (cfg.data) {
      setF((s) => ({
        ...s,
        url: cfg.data!.url ?? "",
        binddn: cfg.data!.binddn ?? "",
        userdn: cfg.data!.userdn ?? "",
        groupdn: cfg.data!.groupdn ?? "",
      }));
    }
  }, [cfg.data]);

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium">Connection</h3>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setSaved(false);
          try {
            await save.mutateAsync({
              url: f.url,
              binddn: f.binddn,
              bindpass: f.bindpass || undefined,
              userdn: f.userdn,
              groupdn: f.groupdn,
            });
            setSaved(true);
          } catch (err) {
            setError(errMsg(err));
          }
        }}
      >
        <Field label="LDAP URL"><Input value={f.url} onChange={set("url")} className="font-mono" placeholder="ldaps://ldap.example.com" /></Field>
        <div className="flex gap-3">
          <Field label="Bind DN"><Input value={f.binddn} onChange={set("binddn")} className="font-mono" /></Field>
          <Field label="Bind password"><Input type="password" value={f.bindpass} onChange={set("bindpass")} /></Field>
        </div>
        <div className="flex gap-3">
          <Field label="User DN"><Input value={f.userdn} onChange={set("userdn")} className="font-mono" /></Field>
          <Field label="Group DN"><Input value={f.groupdn} onChange={set("groupdn")} className="font-mono" /></Field>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save connection"}
          </Button>
          {saved ? <span className="text-xs text-emerald-600">Saved</span> : null}
        </div>
      </form>
    </div>
  );
}

// --- userpass: users ---
function UserpassConfig({ mount }: { mount: string }) {
  const users = useUserpassUsers(mount);
  const create = useCreateUserpassUser(mount);
  const del = useDeleteUserpassUser(mount);
  const [open, setOpen] = React.useState(false);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [policies, setPolicies] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Users</h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus /> Add user
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {(users.data ?? []).map((u) => (
          <li key={u} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="font-mono">{u}</span>
            <Button variant="ghost" size="icon" title="Delete" onClick={() => del.mutate(u)}>
              <Trash2 />
            </Button>
          </li>
        ))}
        {users.data?.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">No users yet.</li>
        ) : null}
      </ul>

      {open ? (
        <Dialog open onClose={() => setOpen(false)}>
          <DialogHeader title="Add user" onClose={() => setOpen(false)} />
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                await create.mutateAsync({
                  username: username.trim(),
                  password,
                  policies: policies ? policies.split(",").map((p) => p.trim()).filter(Boolean) : [],
                });
                setOpen(false);
                setUsername("");
                setPassword("");
                setPolicies("");
              } catch (err) {
                setError(errMsg(err));
              }
            }}
          >
            <Field label="Username">
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Token policies (comma-separated)">
              <Input value={policies} onChange={(e) => setPolicies(e.target.value)} className="font-mono" placeholder="default" />
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>Add</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

// --- approle: roles + role-id / secret-id ---
function ApproleConfig({ mount }: { mount: string }) {
  const roles = useApproleRoles(mount);
  const create = useCreateApproleRole(mount);
  const del = useDeleteApproleRole(mount);
  const roleId = useApproleRoleId();
  const secretId = useGenerateSecretId();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [policies, setPolicies] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [creds, setCreds] = React.useState<{ role: string; roleId?: string; secretId?: string } | null>(null);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Roles</h3>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus /> Add role
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {(roles.data ?? []).map((r) => (
          <li key={r} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="font-mono">{r}</span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const id = await roleId.mutateAsync({ mount, role: r });
                  setCreds({ role: r, roleId: id });
                }}
              >
                Get role-id
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const sid = await secretId.mutateAsync({ mount, role: r });
                  setCreds((c) => ({ role: r, roleId: c?.role === r ? c.roleId : undefined, secretId: sid }));
                }}
              >
                Generate secret-id
              </Button>
              <Button variant="ghost" size="icon" title="Delete" onClick={() => del.mutate(r)}>
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
        {roles.data?.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">No roles yet.</li>
        ) : null}
      </ul>

      {creds ? (
        <div className="mt-4 rounded-md border bg-muted/40 p-3">
          <div className="mb-2 text-sm font-medium">Credentials for {creds.role}</div>
          {creds.roleId ? (
            <CredRow label="role_id" value={creds.roleId} />
          ) : null}
          {creds.secretId ? (
            <CredRow label="secret_id" value={creds.secretId} />
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Use these with the AppRole login method. The secret_id is shown once.
          </p>
        </div>
      ) : null}

      {open ? (
        <Dialog open onClose={() => setOpen(false)}>
          <DialogHeader title="Add role" onClose={() => setOpen(false)} />
          <form
            className="flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              try {
                await create.mutateAsync({
                  name: name.trim(),
                  policies: policies ? policies.split(",").map((p) => p.trim()).filter(Boolean) : [],
                });
                setOpen(false);
                setName("");
                setPolicies("");
              } catch (err) {
                setError(errMsg(err));
              }
            }}
          >
            <Field label="Role name">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" autoFocus />
            </Field>
            <Field label="Token policies (comma-separated)">
              <Input value={policies} onChange={(e) => setPolicies(e.target.value)} className="font-mono" placeholder="default" />
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>Add</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-20 text-xs text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate text-sm">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}

function EnableDialog({
  onClose,
  onEnabled,
}: {
  onClose: () => void;
  onEnabled: (path: string) => void;
}) {
  const enable = useEnableAuth();
  const [type, setType] = React.useState("userpass");
  const [path, setPath] = React.useState("userpass");
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader title="Enable auth method" onClose={onClose} />
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await enable.mutateAsync({ path: path.trim(), type });
            onEnabled(`${path.trim()}/`);
          } catch (err) {
            setError(errMsg(err));
          }
        }}
      >
        <Field label="Type">
          <SelectField
            onValueChange={(value) => {
              setType(value);
              setPath(value);
            }}
            options={ENABLE_TYPES.map((authType) => ({ value: authType, label: authType }))}
            value={type}
          />
        </Field>
        <Field label="Mount path">
          <Input value={path} onChange={(e) => setPath(e.target.value)} className="font-mono" />
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={enable.isPending}>Enable</Button>
        </div>
      </form>
    </Dialog>
  );
}

// --- generic config + roles, driven by per-type field specs ---

type FieldSpec = {
  key: string;
  label: string;
  kind?: "text" | "password" | "textarea" | "list";
  placeholder?: string;
  /** Prefilled when adding a new role. `{redirect_uri}` expands to this app's
   *  OIDC callback so OIDC roles work out of the box. */
  default?: string;
};

const REDIRECT_URI_TOKEN = "{redirect_uri}";

type MethodSpec = {
  config: FieldSpec[];
  roles?: { base: string; label: string; addLabel: string; fields: FieldSpec[] };
};

const ROLE = {
  base: "role",
  label: "Roles",
  addLabel: "Add role",
};

const FIELD_SPECS: Record<string, MethodSpec> = {
  jwt: {
    config: [
      { key: "oidc_discovery_url", label: "OIDC discovery URL", placeholder: "https://issuer.example.com" },
      { key: "jwks_url", label: "JWKS URL" },
      { key: "bound_issuer", label: "Bound issuer" },
      { key: "oidc_client_id", label: "OIDC client ID" },
      { key: "oidc_client_secret", label: "OIDC client secret", kind: "password" },
      { key: "default_role", label: "Default role" },
    ],
    roles: {
      ...ROLE,
      fields: [
        { key: "token_policies", label: "Token policies", kind: "list", placeholder: "default" },
        { key: "user_claim", label: "User claim", placeholder: "sub" },
        { key: "groups_claim", label: "Groups claim", placeholder: "groups" },
        { key: "oidc_scopes", label: "OIDC scopes", kind: "list", placeholder: "openid, email, profile" },
        { key: "bound_audiences", label: "Bound audiences", kind: "list" },
        { key: "allowed_redirect_uris", label: "Allowed redirect URIs", kind: "list" },
        { key: "role_type", label: "Role type", placeholder: "oidc or jwt" },
      ],
    },
  },
  kubernetes: {
    config: [
      { key: "kubernetes_host", label: "Kubernetes host", placeholder: "https://kubernetes.default.svc" },
      { key: "kubernetes_ca_cert", label: "CA certificate (PEM)", kind: "textarea" },
      { key: "token_reviewer_jwt", label: "Token reviewer JWT", kind: "textarea" },
    ],
    roles: {
      ...ROLE,
      fields: [
        { key: "bound_service_account_names", label: "Service account names", kind: "list", placeholder: "vault-auth" },
        { key: "bound_service_account_namespaces", label: "Namespaces", kind: "list", placeholder: "default" },
        { key: "token_policies", label: "Token policies", kind: "list", placeholder: "default" },
      ],
    },
  },
  cert: {
    config: [],
    roles: {
      base: "certs",
      label: "Trusted certificates",
      addLabel: "Add certificate",
      fields: [
        { key: "certificate", label: "Certificate (PEM)", kind: "textarea" },
        { key: "token_policies", label: "Token policies", kind: "list", placeholder: "default" },
        { key: "allowed_common_names", label: "Allowed common names", kind: "list" },
      ],
    },
  },
};
// OIDC reuses JWT's fields, but a working sign-in role needs role_type "oidc"
// and this app's callback in allowed_redirect_uris — prefill both so a role
// created here doesn't yield an empty auth_url at login.
FIELD_SPECS.oidc = {
  ...FIELD_SPECS.jwt,
  roles: {
    ...FIELD_SPECS.jwt.roles!,
    fields: FIELD_SPECS.jwt.roles!.fields.map((f) =>
      f.key === "allowed_redirect_uris"
        ? { ...f, default: REDIRECT_URI_TOKEN }
        : f.key === "role_type"
          ? { ...f, default: "oidc" }
          : f,
    ),
  },
};

function buildBody(fields: FieldSpec[], vals: Record<string, string>) {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = vals[f.key];
    if (raw == null || raw === "") continue;
    body[f.key] =
      f.kind === "list"
        ? raw.split(",").map((s) => s.trim()).filter(Boolean)
        : raw;
  }
  return body;
}

function DynField({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={field.label}>
      {field.kind === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          spellCheck={false}
          className="h-24 w-full rounded-md border bg-transparent p-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <Input
          type={field.kind === "password" ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={field.kind === "list" ? "font-mono" : undefined}
        />
      )}
    </Field>
  );
}

function GenericConfig({ mount, spec }: { mount: string; spec: MethodSpec }) {
  return (
    <div className="flex flex-col gap-5">
      {spec.config.length ? <ConfigFields mount={mount} fields={spec.config} /> : null}
      {spec.roles ? <RolesPanel mount={mount} spec={spec.roles} /> : null}
    </div>
  );
}

function ConfigFields({ mount, fields }: { mount: string; fields: FieldSpec[] }) {
  const cfg = useAuthConfig(mount);
  const save = useSetAuthConfig(mount);
  const [vals, setVals] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!cfg.data) return;
    const init: Record<string, string> = {};
    for (const f of fields) {
      const v = cfg.data[f.key];
      if (v != null && f.kind !== "password") {
        init[f.key] = Array.isArray(v) ? v.join(", ") : String(v);
      }
    }
    setVals(init);
  }, [cfg.data, fields]);

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium">Configuration</h3>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setSaved(false);
          try {
            await save.mutateAsync(buildBody(fields, vals));
            setSaved(true);
          } catch (err) {
            setError(errMsg(err));
          }
        }}
      >
        {fields.map((f) => (
          <DynField
            key={f.key}
            field={f}
            value={vals[f.key] ?? ""}
            onChange={(v) => setVals((s) => ({ ...s, [f.key]: v }))}
          />
        ))}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save configuration"}
          </Button>
          {saved ? <span className="text-xs text-emerald-600">Saved</span> : null}
        </div>
      </form>
    </div>
  );
}

function RolesPanel({
  mount,
  spec,
}: {
  mount: string;
  spec: NonNullable<MethodSpec["roles"]>;
}) {
  const roles = useAuthRoles(mount, spec.base);
  const create = useCreateAuthRole(mount, spec.base);
  const del = useDeleteAuthRole(mount, spec.base);
  const uiConfig = useUiConfig();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [vals, setVals] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">{spec.label}</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            // Prefer the OPENBAO_UI_PUBLIC_URL override so a manually-created
            // OIDC role registers the same redirect URI the login route sends.
            const redirectUri = oidcCallbackUrl(uiConfig.data?.publicUrl);
            const init: Record<string, string> = {};
            for (const f of spec.fields) {
              if (f.default != null) {
                init[f.key] = f.default.replace(REDIRECT_URI_TOKEN, redirectUri);
              }
            }
            setName("");
            setVals(init);
            setError(null);
            setOpen(true);
          }}
        >
          <Plus /> {spec.addLabel}
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {(roles.data ?? []).map((r) => (
          <li key={r} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="font-mono">{r}</span>
            <Button variant="ghost" size="icon" title="Delete" onClick={() => del.mutate(r)}>
              <Trash2 />
            </Button>
          </li>
        ))}
        {roles.data?.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">None yet.</li>
        ) : null}
      </ul>

      {open ? (
        <Dialog open onClose={() => setOpen(false)} className="max-w-lg">
          <DialogHeader title={spec.addLabel} onClose={() => setOpen(false)} />
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              if (!name.trim()) return setError("Name is required");
              try {
                await create.mutateAsync({ name: name.trim(), body: buildBody(spec.fields, vals) });
                setOpen(false);
              } catch (err) {
                setError(errMsg(err));
              }
            }}
          >
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="font-mono" autoFocus />
            </Field>
            {spec.fields.map((f) => (
              <DynField
                key={f.key}
                field={f}
                value={vals[f.key] ?? ""}
                onChange={(v) => setVals((s) => ({ ...s, [f.key]: v }))}
              />
            ))}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={create.isPending}>Save</Button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
