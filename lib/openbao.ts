/**
 * Server-side OpenBao client. Used by BFF route handlers and Server
 * Components only — the token never reaches the browser as JS-readable state.
 *
 * Base address comes from OPENBAO_ADDR (the in-container OpenBao in Docker).
 */
const OPENBAO_ADDR = process.env.OPENBAO_ADDR ?? "http://127.0.0.1:8200";
const OpenBaoRequestTimeoutMs = 10_000;

/** Parse a response body as JSON, tolerating empty/non-JSON payloads (HTML
 *  error pages, proxy responses) by returning null so callers fall back to
 *  status-based error handling instead of throwing. */
function parseJsonSafe(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export class OpenBaoRequestError extends Error {
  status: number;
  errors: string[];

  constructor(status: number, errors: string[]) {
    super(errors[0] ?? `OpenBao request failed (${status})`);
    this.name = "OpenBaoRequestError";
    this.status = status;
    this.errors = errors;
  }
}

type RequestOptions = {
  method?: string;
  token?: string;
  body?: unknown;
  namespace?: string;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", token, body, namespace } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["X-Vault-Token"] = token;
  if (namespace) headers["X-Vault-Namespace"] = namespace;

  let res: Response;
  try {
    res = await fetch(`${OPENBAO_ADDR}/v1/${path.replace(/^\/+/, "")}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(OpenBaoRequestTimeoutMs),
    });
  } catch {
    throw new OpenBaoRequestError(503, ["OpenBao is temporarily unavailable."]);
  }

  const text = await res.text();
  const data = parseJsonSafe(text);

  if (!res.ok) {
    const errors: string[] = data?.errors?.length
      ? data.errors
      : [`OpenBao request failed (${res.status})`];
    throw new OpenBaoRequestError(res.status, errors);
  }

  return data as T;
}

// --- Typed wrappers for the endpoints used by the current scaffold ---

export type TokenLookup = {
  data: {
    display_name: string;
    policies: string[];
    ttl: number;
    renewable: boolean;
    expire_time: string | null;
    meta: Record<string, string> | null;
  };
};

export type SealStatus = {
  type: string;
  initialized: boolean;
  sealed: boolean;
  version: string;
  cluster_name?: string;
};

export type AuthResponse = {
  auth: {
    client_token: string;
    policies: string[];
    metadata: Record<string, string> | null;
    lease_duration: number;
    renewable: boolean;
  };
};

export type MountsResponse = {
  data: Record<string, { type: string; description: string; accessor: string }>;
};

export const openbao = {
  /** Validate a raw token and return its metadata. */
  lookupSelf: (token: string, namespace?: string) =>
    request<TokenLookup>("auth/token/lookup-self", { token, namespace }),

  /** Username/password login -> returns a client token in `auth`. */
  userpassLogin: (mount: string, username: string, password: string) =>
    request<AuthResponse>(
      `auth/${mount}/login/${encodeURIComponent(username)}`,
      {
        method: "POST",
        body: { password },
      },
    ),

  /** LDAP login. */
  ldapLogin: (mount: string, username: string, password: string) =>
    request<AuthResponse>(
      `auth/${mount}/login/${encodeURIComponent(username)}`,
      { method: "POST", body: { password } },
    ),

  /** AppRole login (role_id + secret_id). */
  approleLogin: (mount: string, roleId: string, secretId: string) =>
    request<AuthResponse>(`auth/${mount}/login`, {
      method: "POST",
      body: { role_id: roleId, secret_id: secretId },
    }),

  /** OIDC: get the provider authorization URL to redirect the user to. */
  oidcAuthURL: (
    mount: string,
    role: string | undefined,
    redirectUri: string,
    clientNonce: string,
  ) =>
    request<{ data: { auth_url: string } }>(`auth/${mount}/oidc/auth_url`, {
      method: "POST",
      body: { role, redirect_uri: redirectUri, client_nonce: clientNonce },
    }),

  /** OIDC: exchange the callback code/state for a client token. */
  oidcCallback: (
    mount: string,
    state: string,
    code: string,
    clientNonce: string,
  ) =>
    request<AuthResponse>(
      `auth/${mount}/oidc/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}&client_nonce=${encodeURIComponent(clientNonce)}`,
    ),

  /** Renew the current token; returns the new lease duration. */
  renewSelf: (token: string) =>
    request<AuthResponse>("auth/token/renew-self", { method: "POST", token }),

  /** Revoke the current bearer during logout; failures must not prevent cookie clearing. */
  revokeSelf: (token: string) =>
    request<void>("auth/token/revoke-self", { method: "POST", token }),

  /** Unauthenticated: current seal status of the instance. */
  sealStatus: () => request<SealStatus>("sys/seal-status"),

  /** List enabled secret engines (mounts). */
  listMounts: (token: string) =>
    request<MountsResponse>("sys/mounts", { token }),

  /** Resolve the calling token's capabilities on one or more paths. */
  capabilitiesSelf: (token: string, paths: string[], namespace?: string) =>
    request<{ data: Record<string, string[]> & { capabilities?: string[] } }>(
      "sys/capabilities-self",
      { method: "POST", token, namespace, body: { paths } },
    ),
};

export { OPENBAO_ADDR };
