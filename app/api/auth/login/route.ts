import { NextResponse } from "next/server";

import { isCrossSiteRequest } from "@/lib/csrf";
import { openbao, OpenBaoRequestError } from "@/lib/openbao";
import { setToken } from "@/lib/session";

type LoginBody = { namespace?: string } & (
  | { method: "token"; token: string }
  | { method: "userpass"; mount?: string; username: string; password: string }
  | { method: "ldap"; mount?: string; username: string; password: string }
  | { method: "approle"; mount?: string; roleId: string; secretId: string }
);

// Same cookie the client's namespace switcher writes (lib/namespace.tsx).
const NS_COOKIE = "bao_ns";
const NS_PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;

/** Open the app in the namespace the user signed in to, so requests aren't sent to root. */
function withNamespace(res: NextResponse, namespace: string): NextResponse {
  res.cookies.set(NS_COOKIE, namespace, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  });
  return res;
}

/**
 * POST /ui2/api/auth/login
 *
 * Validates credentials against OpenBao server-side, then stores the resulting
 * token in an httpOnly cookie. The raw token never reaches client JS.
 */
export async function POST(req: Request) {
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ error: "cross-site request blocked" }, { status: 403 });
  }
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const namespace = (body.namespace ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (namespace && !NS_PATH.test(namespace)) {
    return NextResponse.json({ error: "Invalid namespace path" }, { status: 400 });
  }
  const ns = namespace || undefined;

  try {
    if (body.method === "token") {
      const token = body.token?.trim();
      if (!token) {
        return NextResponse.json({ error: "Token is required" }, { status: 400 });
      }
      const lookup = await openbao.lookupSelf(token);
      await setToken(token, lookup.data.ttl);
      return withNamespace(
        NextResponse.json({ displayName: lookup.data.display_name, policies: lookup.data.policies }),
        namespace,
      );
    }

    if (body.method === "userpass" || body.method === "ldap") {
      const { username, password } = body;
      if (!username || !password) {
        return NextResponse.json(
          { error: "Username and password are required" },
          { status: 400 },
        );
      }
      const res =
        body.method === "ldap"
          ? await openbao.ldapLogin(body.mount || "ldap", username, password, ns)
          : await openbao.userpassLogin(body.mount || "userpass", username, password, ns);
      await setToken(res.auth.client_token, res.auth.lease_duration);
      return withNamespace(
        NextResponse.json({ displayName: username, policies: res.auth.policies }),
        namespace,
      );
    }

    if (body.method === "approle") {
      const { roleId, secretId } = body;
      if (!roleId || !secretId) {
        return NextResponse.json(
          { error: "Role ID and Secret ID are required" },
          { status: 400 },
        );
      }
      const res = await openbao.approleLogin(
        body.mount || "approle",
        roleId,
        secretId,
        ns,
      );
      await setToken(res.auth.client_token, res.auth.lease_duration);
      return withNamespace(
        NextResponse.json({ displayName: "approle", policies: res.auth.policies }),
        namespace,
      );
    }

    return NextResponse.json({ error: "Unknown auth method" }, { status: 400 });
  } catch (err) {
    if (err instanceof OpenBaoRequestError) {
      // 400/403 from OpenBao -> surface as an auth failure.
      const status = err.status === 403 || err.status === 400 ? 401 : 502;
      return NextResponse.json({ error: err.errors.join(", ") }, { status });
    }
    return NextResponse.json(
      { error: "Could not reach OpenBao" },
      { status: 502 },
    );
  }
}
