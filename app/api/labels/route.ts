import { NextRequest } from "next/server";

import { isCrossSiteRequest } from "@/lib/csrf";
import { listLabels, upsertLabel, type LabelScope } from "@/lib/db";
import {
  asJsonResponse,
  Dependency,
  forbidden,
  invalidRequest,
  payloadTooLarge,
  serviceUnavailable,
  success,
} from "@/lib/http/response";
import {
  authorizeMetadataOperator,
  authorizeMetadataRequest,
} from "@/lib/metadata-session";
import { parseJsonBody, RequestBodyError } from "@/lib/request-body";

/** Presentation-only labels for namespaces, mounts, and application paths. */
export const dynamic = "force-dynamic";

const LabelScopeValue = {
  Workspace: "workspace",
  Environment: "environment",
  Application: "application",
} as const;
const LabelScopes = new Set<LabelScope>(Object.values(LabelScopeValue));
const MaxLabelsBodyBytes = 16 * 1024;

type LabelPayload = Record<string, unknown>;

function isLabelScope(value: unknown): value is LabelScope {
  return typeof value === "string" && LabelScopes.has(value as LabelScope);
}

function requestBodyFailure(error: unknown) {
  if (error instanceof RequestBodyError && error.status === 413) {
    return payloadTooLarge("The labels request body is too large.");
  }
  return invalidRequest("The request body must be valid JSON.");
}

export async function GET(req: NextRequest) {
  const authorization = await authorizeMetadataRequest(req.headers);
  if (authorization.response) return authorization.response;
  const operatorRejection = await authorizeMetadataOperator(
    authorization.session,
  );
  if (operatorRejection) return operatorRejection;

  const requestedScope = req.nextUrl.searchParams.get("scope");
  if (requestedScope !== null && !isLabelScope(requestedScope)) {
    return asJsonResponse(invalidRequest("scope is invalid."));
  }

  try {
    const labels = listLabels(
      authorization.session.namespace,
      requestedScope ?? undefined,
    );
    return asJsonResponse(success({ labels }));
  } catch {
    return asJsonResponse(serviceUnavailable(Dependency.Storage));
  }
}

export async function PUT(req: NextRequest) {
  const authorization = await authorizeMetadataRequest(req.headers);
  if (authorization.response) return authorization.response;
  const { session } = authorization;

  if (isCrossSiteRequest(req)) {
    return asJsonResponse(forbidden("Cross-site requests are not allowed."));
  }

  const operatorRejection = await authorizeMetadataOperator(session);
  if (operatorRejection) return operatorRejection;

  let payload: LabelPayload;
  try {
    payload = await parseJsonBody<LabelPayload>(req, MaxLabelsBodyBytes);
  } catch (error) {
    return asJsonResponse(requestBodyFailure(error));
  }

  if (!isLabelScope(payload.scope)) {
    return asJsonResponse(invalidRequest("scope is invalid."));
  }
  if (typeof payload.ref !== "string" || payload.ref.length === 0) {
    return asJsonResponse(invalidRequest("ref is required."));
  }

  try {
    const label = upsertLabel({
      namespace: session.namespace,
      scope: payload.scope,
      ref: payload.ref,
      label: payload.label,
      description: payload.description,
      color: payload.color,
      env_group: payload.env_group,
    });
    return asJsonResponse(success({ label }));
  } catch {
    return asJsonResponse(serviceUnavailable(Dependency.Storage));
  }
}
