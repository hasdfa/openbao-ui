import { NextResponse } from "next/server";

import { openbao, OpenBaoRequestError } from "@/lib/openbao";
import { getToken } from "@/lib/session";

type Authorization =
  | { token: string; namespace: string; error?: never }
  | { error: NextResponse; token?: never; namespace?: never };

const normalize = (namespace: string) => namespace.replace(/^\/+|\/+$/g, "");

function isAuthFailure(err: unknown): boolean {
  return err instanceof OpenBaoRequestError && [400, 403, 404].includes(err.status);
}

/** Metadata is readable in the token's own namespace, or one it can enter. */
export async function authorizeMetadata(req: Request): Promise<Authorization> {
  const deny = (message: string, status: number): Authorization => ({
    error: NextResponse.json({ errors: [message] }, { status }),
  });
  const token = await getToken();
  if (!token) return deny("not authenticated", 401);
  const namespace = normalize(req.headers.get("x-vault-namespace") ?? "");
  if (namespace && namespace.split("/").some((part) => !part || part === "." || part === "..")) {
    return deny("invalid namespace", 400);
  }

  try {
    const lookup = await openbao.lookupSelf(token);
    // OpenBao runs lookup-self in the token's home namespace, ignoring the
    // request header. A foreign namespace needs a header-aware probe.
    const ownNamespace = normalize(lookup.data.namespace_path ?? "");
    if (namespace !== ownNamespace) {
      try {
        const caps = await openbao.capabilitiesSelf(
          token,
          ["sys/capabilities-self"],
          namespace,
        );
        const granted =
          caps.data?.["sys/capabilities-self"] ?? caps.data?.capabilities ?? [];
        if (!granted.some((c) => c && c !== "deny")) {
          return deny("forbidden: namespace access required", 403);
        }
      } catch (err) {
        if (isAuthFailure(err)) return deny("forbidden: namespace access required", 403);
        throw err;
      }
    }
    return { token, namespace };
  } catch (err) {
    if (isAuthFailure(err)) return deny("not authenticated", 401);
    return deny("could not validate session", 502);
  }
}
