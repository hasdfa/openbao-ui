import { NextRequest } from "next/server";

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
import {
  DEFAULT_ROLE_TEMPLATES,
  isRoleTemplate,
  type RoleTemplate,
} from "@/lib/role-defaults";
import { parseJsonBody, RequestBodyError } from "@/lib/request-body";

/** Role-template catalog, seeded by domain defaults until customized. */
export const dynamic = "force-dynamic";

const key = (namespace: string) => `role-templates::${namespace}`;
const MaxRoleTemplatesBodyBytes = 64 * 1024;

type RoleTemplatesPayload = { templates?: RoleTemplate[] };

function requestBodyFailure(error: unknown) {
  if (error instanceof RequestBodyError && error.status === 413) {
    return payloadTooLarge("The role-template request body is too large.");
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
    const templates =
      getConfig<RoleTemplate[]>(key(authorization.session.namespace)) ??
      DEFAULT_ROLE_TEMPLATES;
    return asJsonResponse(success({ templates }));
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

  let payload: RoleTemplatesPayload;
  try {
    const parsed = await parseJsonBody<unknown>(req, MaxRoleTemplatesBodyBytes);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as RoleTemplatesPayload).templates) ||
      !(parsed as RoleTemplatesPayload).templates?.every(isRoleTemplate)
    ) {
      return asJsonResponse(
        invalidRequest("templates must be an array of valid role templates."),
      );
    }
    payload = parsed as RoleTemplatesPayload;
  } catch (error) {
    return asJsonResponse(requestBodyFailure(error));
  }

  if (!Array.isArray(payload.templates)) {
    return asJsonResponse(invalidRequest("templates must be an array."));
  }

  try {
    setConfig(key(session.namespace), payload.templates);
    return asJsonResponse(success({ templates: payload.templates }));
  } catch {
    return asJsonResponse(serviceUnavailable(Dependency.Storage));
  }
}
