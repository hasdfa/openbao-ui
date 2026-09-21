import { NextRequest, NextResponse } from "next/server";

import { isCrossSiteRequest } from "@/lib/csrf";
import { getConfig, setConfig } from "@/lib/db";
import { authorizeMetadata } from "@/lib/metadata-auth";
import { isOperator } from "@/lib/ui-admin";

/**
 * Definitions of scoped access roles (shareable env groups + app-specific
 * groups), per namespace. These are the structured intent ({ env selector, app,
 * level }); materializing one into an OpenBao policy + identity group happens
 * client-side. Stored so they're editable and re-syncable.
 *   GET /ui2/api/access-roles  — authenticated
 *   PUT /ui2/api/access-roles  — operator only (namespace from header)
 */
export const dynamic = "force-dynamic";

const key = (ns: string) => `access-roles::${ns}`;

export async function GET(req: NextRequest) {
  const auth = await authorizeMetadata(req);
  if (auth.error) return auth.error;
  const { namespace: ns } = auth;
  return NextResponse.json({ roles: getConfig<unknown[]>(key(ns)) ?? [] });
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeMetadata(req);
  if (auth.error) return auth.error;
  const { namespace: ns } = auth;
  if (isCrossSiteRequest(req)) {
    return NextResponse.json(
      { errors: ["cross-site request blocked"] },
      { status: 403 },
    );
  }
  // Namespace from the caller's header gates the operator check and the key.
  if (!(await isOperator(auth.token, ns))) {
    return NextResponse.json(
      { errors: ["forbidden: requires mount-management capability"] },
      { status: 403 },
    );
  }
  let body: { roles?: unknown[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ errors: ["invalid JSON"] }, { status: 400 });
  }
  if (!Array.isArray(body.roles)) {
    return NextResponse.json({ errors: ["roles must be an array"] }, { status: 400 });
  }
  try {
    setConfig(key(ns), body.roles);
    return NextResponse.json({ roles: body.roles });
  } catch {
    return NextResponse.json({ errors: ["could not save roles"] }, { status: 500 });
  }
}
