import { NextRequest, NextResponse } from "next/server";

import { isCrossSiteRequest } from "@/lib/csrf";
import { getConfig, setConfig } from "@/lib/db";
import { authorizeMetadata } from "@/lib/metadata-auth";
import { safeAuthMount, safeBaoName } from "@/lib/oidc-domains";
import { isOperator } from "@/lib/ui-admin";

/**
 * Definitions of issued project credentials (AppRole machine identities), per
 * namespace. Stores ONLY the non-secret definition — project, env selector, level,
 * and the materialized role/policy names — so they can be listed, rotated, and
 * revoked. The secret_id is shown once at issue/rotate time and is NEVER stored.
 *   GET /ui2/api/project-credentials  — authenticated
 *   PUT /ui2/api/project-credentials  — operator only (namespace from header)
 */
export const dynamic = "force-dynamic";

function invalidStoredCredential(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "credential must be an object";
  const cred = raw as Record<string, unknown>;
  if (!safeBaoName(typeof cred.project === "string" ? cred.project : "")) return "invalid project name";
  if (!safeAuthMount(typeof cred.mount === "string" ? cred.mount : "")) return "invalid AppRole mount";
  if (!Array.isArray(cred.roles)) return "roles must be an array";
  for (const row of cred.roles) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return "role entry must be an object";
    const rec = row as Record<string, unknown>;
    if (!safeBaoName(typeof rec.role === "string" ? rec.role : "")) return "invalid role name";
    if (!safeBaoName(typeof rec.policy === "string" ? rec.policy : "")) return "invalid policy name";
  }
  return null;
}

const key = (ns: string) => `project-credentials::${ns}`;

export async function GET(req: NextRequest) {
  const auth = await authorizeMetadata(req);
  if (auth.error) return auth.error;
  const { namespace: ns } = auth;
  return NextResponse.json({ creds: getConfig<unknown[]>(key(ns)) ?? [] });
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeMetadata(req);
  if (auth.error) return auth.error;
  const { namespace: ns } = auth;
  if (isCrossSiteRequest(req)) {
    return NextResponse.json({ errors: ["cross-site request blocked"] }, { status: 403 });
  }
  if (!(await isOperator(auth.token, ns))) {
    return NextResponse.json(
      { errors: ["forbidden: requires mount-management capability"] },
      { status: 403 },
    );
  }
  let body: { creds?: unknown[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ errors: ["invalid JSON"] }, { status: 400 });
  }
  if (!Array.isArray(body.creds)) {
    return NextResponse.json({ errors: ["creds must be an array"] }, { status: 400 });
  }
  for (const cred of body.creds) {
    const err = invalidStoredCredential(cred);
    if (err) return NextResponse.json({ errors: [err] }, { status: 400 });
  }
  try {
    setConfig(key(ns), body.creds);
    return NextResponse.json({ creds: body.creds });
  } catch {
    return NextResponse.json({ errors: ["could not save credentials"] }, { status: 500 });
  }
}
