import { NextRequest, NextResponse } from "next/server";

import { isCrossSiteRequest } from "@/lib/csrf";
import { listLabels, upsertLabel, type LabelScope } from "@/lib/db";
import { authorizeMetadata } from "@/lib/metadata-auth";
import { isOperator } from "@/lib/ui-admin";

/**
 * UI "nicer naming" labels for namespaces / mounts / paths.
 *   GET  /ui2/api/labels?namespace=<ns>[&scope=<scope>]  — valid session with namespace access
 *   PUT  /ui2/api/labels                                  — operator only
 *
 * Reads require a validated OpenBao session that can enter the requested
 * namespace (labels are non-secret presentation data); writes are CSRF-guarded
 * and gated on mount-management capability.
 */
export const dynamic = "force-dynamic";

const SCOPES = new Set<LabelScope>(["workspace", "environment", "application"]);
const isScope = (s: unknown): s is LabelScope =>
  typeof s === "string" && SCOPES.has(s as LabelScope);

export async function GET(req: NextRequest) {
  const auth = await authorizeMetadata(req);
  if (auth.error) return auth.error;
  const { namespace: namespace } = auth;
  const scopeParam = req.nextUrl.searchParams.get("scope");
  if (scopeParam && !isScope(scopeParam)) {
    return NextResponse.json({ errors: ["invalid scope"] }, { status: 400 });
  }
  try {
    const labels = listLabels(namespace, scopeParam as LabelScope | undefined);
    return NextResponse.json({ labels });
  } catch {
    return NextResponse.json(
      { errors: ["could not read labels"] },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeMetadata(req);
  if (auth.error) return auth.error;
  const { namespace: namespace } = auth;
  if (isCrossSiteRequest(req)) {
    return NextResponse.json(
      { errors: ["cross-site request blocked"] },
      { status: 403 },
    );
  }
  // Authorize against — and store under — the caller's own namespace (header),
  // never a body-supplied namespace, so an operator in A can't write B's labels.
  if (!(await isOperator(auth.token, namespace))) {
    return NextResponse.json(
      { errors: ["forbidden: requires mount-management capability"] },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ errors: ["invalid JSON"] }, { status: 400 });
  }

  const scope = body.scope;
  const ref = body.ref;
  if (!isScope(scope)) {
    return NextResponse.json({ errors: ["invalid scope"] }, { status: 400 });
  }
  if (typeof ref !== "string" || !ref) {
    return NextResponse.json({ errors: ["ref is required"] }, { status: 400 });
  }

  try {
    const label = upsertLabel({
      namespace,
      scope,
      ref,
      label: body.label,
      description: body.description,
      color: body.color,
      env_group: body.env_group,
    });
    return NextResponse.json({ label });
  } catch {
    return NextResponse.json(
      { errors: ["could not save label"] },
      { status: 500 },
    );
  }
}
