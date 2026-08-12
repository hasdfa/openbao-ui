"use client";

import { LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_BASE } from "@/lib/base-path";

const LOGIN_ENDPOINT = `${API_BASE}/auth/login`;
const OIDC_START = `${API_BASE}/auth/oidc/start`;

const METHODS = [
  { value: "token", label: "Token" },
  { value: "userpass", label: "Username & Password" },
  { value: "ldap", label: "LDAP" },
  { value: "approle", label: "AppRole" },
  { value: "oidc", label: "OIDC / JWT" },
];

type DiscoveredMethod = { path: string; type: string; description?: string };

type Branding = {
  title?: string;
  subtitle?: string;
  logoUrl?: string;
  accent?: string;
};
type UiConfig = {
  branding?: Branding;
  defaultLoginMethod?: string;
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

async function startOidc(mount: string): Promise<{ authUrl?: string; error?: string }> {
  try {
    const res = await fetch(OIDC_START, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mount: mount || undefined }),
    });
    const result = await res.json() as { ok: boolean; data?: { authUrl?: string }; error?: { message?: string } };
    if (!result.ok) return { error: result.error?.message ?? "OIDC start failed" };
    return { authUrl: result.data?.authUrl };
  } catch {
    return { error: "Network error — is OpenBao reachable?" };
  }
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [method, setMethod] = useState("token");
  const [f, setF] = useState({
    token: "",
    username: "",
    password: "",
    roleId: "",
    secretId: "",
    mount: "",
    role: "",
  });
  const [error, setError] = useState<string | null>(search.get("error") || null);
  const [loading, setLoading] = useState(false);

  // Login customization: discovered (unauth) methods + branding/default.
  const [discovered, setDiscovered] = useState<DiscoveredMethod[]>([]);
  const [cfg, setCfg] = useState<UiConfig>({});

  useEffect(() => {
    // sys/internal/ui/mounts is unauthenticated and returns only methods tuned
    // with listing_visibility=unauth — exactly what belongs on the login page.
    fetch("/v1/sys/internal/ui/mounts")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const auth = (d?.data?.auth ?? {}) as Record<
          string,
          { type: string; description?: string }
        >;
        setDiscovered(
          Object.entries(auth).map(([path, v]) => ({
            path,
            type: v.type,
            description: v.description,
          })),
        );
      })
      .catch(() => {});
    fetch(`${API_BASE}/ui-config`)
      .then((response) => response.json())
      .then((result: { ok?: boolean; data?: { config?: UiConfig } }) =>
        setCfg(result.ok ? result.data?.config ?? {} : {}),
      )
      .catch(() => {});
  }, []);

  // Only true OIDC (redirect-flow) methods become prominent buttons; the
  // default method (if any) is promoted to the front.
  const oidcMethods = useMemo(() => {
    const list = discovered.filter((m) => m.type === "oidc");
    const def = cfg.defaultLoginMethod?.replace(/\/$/, "");
    return [...list].sort((a, b) => {
      const am = a.path.replace(/\/$/, "");
      const bm = b.path.replace(/\/$/, "");
      return am === def ? -1 : bm === def ? 1 : 0;
    });
  }, [discovered, cfg.defaultLoginMethod]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function oidcButton(mount: string) {
    setError(null);
    setLoading(true);
    const { authUrl, error } = await startOidc(mount);
    if (error || !authUrl) {
      setError(error ?? "OpenBao returned no sign-in URL — check the OIDC role's allowed_redirect_uris.");
      setLoading(false);
      return;
    }
    window.location.href = authUrl;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (method === "oidc") {
        const res = await fetch(OIDC_START, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mount: f.mount || undefined, role: f.role || undefined }),
        });
        const result = await res.json() as { ok: boolean; data?: { authUrl?: string }; error?: { message?: string } };
        if (!result.ok) return setError(result.error?.message ?? "OIDC start failed");
        if (!result.data?.authUrl) return setError("OIDC start returned no authorization URL.");
        window.location.href = result.data.authUrl;
        return;
      }

      const payload: Record<string, unknown> = { method };
      if (method === "token") payload.token = f.token;
      if (method === "userpass")
        Object.assign(payload, { username: f.username, password: f.password, mount: f.mount || undefined });
      if (method === "ldap")
        Object.assign(payload, { username: f.username, password: f.password, mount: f.mount || undefined });
      if (method === "approle")
        Object.assign(payload, { roleId: f.roleId, secretId: f.secretId, mount: f.mount || undefined });

      const res = await fetch(LOGIN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json() as { ok: boolean; error?: { message?: string } };
      if (!result.ok) {
        setError(result.error?.message ?? "Login failed");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error — is OpenBao reachable?");
    } finally {
      setLoading(false);
    }
  }

  const branding = cfg.branding ?? {};
  const title = branding.title || "Sign in to OpenBao";
  const subtitle = branding.subtitle || "Authenticate to manage your secrets.";
  const hasPrimary = oidcMethods.length > 0;

  const credentialForm = (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="method">Method</Label>
        <Select
          items={METHODS}
          value={method}
          onValueChange={(value) => {
            setMethod(value ?? "token");
            setError(null);
          }}
        >
          <SelectTrigger id="method">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {method === "token" ? (
        <Field label="Token">
          <Input id="token" type="password" autoComplete="off" placeholder="s.xxxx or root" value={f.token} onChange={set("token")} />
        </Field>
      ) : null}

      {method === "userpass" || method === "ldap" ? (
        <>
          <Field label="Mount path (optional)">
            <Input placeholder={method} value={f.mount} onChange={set("mount")} className="font-mono" />
          </Field>
          <Field label="Username">
            <Input id="username" autoComplete="username" value={f.username} onChange={set("username")} />
          </Field>
          <Field label="Password">
            <Input id="password" type="password" autoComplete="current-password" value={f.password} onChange={set("password")} />
          </Field>
        </>
      ) : null}

      {method === "approle" ? (
        <>
          <Field label="Mount path">
            <Input placeholder="approle" value={f.mount} onChange={set("mount")} className="font-mono" />
          </Field>
          <Field label="Role ID">
            <Input value={f.roleId} onChange={set("roleId")} className="font-mono" />
          </Field>
          <Field label="Secret ID">
            <Input type="password" value={f.secretId} onChange={set("secretId")} className="font-mono" />
          </Field>
        </>
      ) : null}

      {method === "oidc" ? (
        <>
          <Field label="Mount path">
            <Input placeholder="oidc" value={f.mount} onChange={set("mount")} className="font-mono" />
          </Field>
          <Field label="Role (optional)">
            <Input value={f.role} onChange={set("role")} className="font-mono" />
          </Field>
        </>
      ) : null}

      <Button type="submit" disabled={loading}>
        {loading ? "Signing in…" : method === "oidc" ? "Continue with OIDC" : "Sign in"}
      </Button>
    </form>
  );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-muted/30 to-muted/60 p-4">
      <Card className="w-full max-w-sm overflow-hidden rounded-2xl shadow-xl duration-300 animate-in fade-in-0 zoom-in-95">
        {branding.accent ? (
          <div className="h-1.5 w-full" style={{ backgroundColor: branding.accent }} />
        ) : null}
        <CardHeader>
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={title} className="mx-auto mb-2 h-16 w-auto" />
          ) : (
            <Logo variant="vertical" className="mx-auto mb-2 h-20 w-auto" />
          )}
          <CardTitle className="text-center text-xl">{title}</CardTitle>
          <CardDescription className="text-center">{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

          {hasPrimary ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {oidcMethods.map((m) => (
                  <Button
                    key={m.path}
                    type="button"
                    disabled={loading}
                    onClick={() => oidcButton(m.path.replace(/\/$/, ""))}
                    style={
                      branding.accent ? { backgroundColor: branding.accent } : undefined
                    }
                  >
                    <LogIn /> {m.description || `Continue with ${m.path.replace(/\/$/, "")}`}
                  </Button>
                ))}
              </div>
              <Disclosure label="Other ways to sign in">{credentialForm}</Disclosure>
            </div>
          ) : (
            credentialForm
          )}
        </CardContent>
      </Card>
    </main>
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
