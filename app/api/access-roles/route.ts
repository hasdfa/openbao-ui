import { NextRequest } from "next/server";

import { isAccessRole } from "@/lib/access-role-schema";
import { isCrossSiteRequest } from "@/lib/csrf";
import { getConfig, setConfig } from "@/lib/db";
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

/**
 * Definitions of scoped access roles (shareable env groups + app-specific
 * groups), per namespace. These are structured intent; materializing policies
 * and identity groups happens through the OpenBao client.
 */
export const dynamic = "force-dynamic";

const key = (namespace: string) => `access-roles::${namespace}`;
const MaxAccessRolesBodyBytes = 64 * 1024;

type AccessRolesPayload = { roles?: unknown[] };

function requestBodyFailure(error: unknown) {
  if (error instanceof RequestBodyError && error.status === 413) {
    return payloadTooLarge("The access-role request body is too large.");
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

  try {
    const roles =
      getConfig<unknown[]>(key(authorization.session.namespace)) ?? [];
    return asJsonResponse(success({ roles }));
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

  let parsed: unknown;
  try {
    parsed = await parseJsonBody<unknown>(req, MaxAccessRolesBodyBytes);
  } catch (error) {
    return asJsonResponse(requestBodyFailure(error));
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as AccessRolesPayload).roles) ||
    !(parsed as AccessRolesPayload).roles?.every(isAccessRole)
  ) {
    return asJsonResponse(
      invalidRequest("roles must be an array of valid access roles."),
    );
  }
  const payload = parsed as AccessRolesPayload;

  if (!Array.isArray(payload.roles)) {
    return asJsonResponse(invalidRequest("roles must be an array."));
  }

  try {
    setConfig(key(session.namespace), payload.roles);
    return asJsonResponse(success({ roles: payload.roles }));
  } catch {
    return asJsonResponse(serviceUnavailable(Dependency.Storage));
  }
}
