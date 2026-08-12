import { NextRequest } from "next/server";

import { isAppCredential } from "@/lib/app-credential-schema";
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
 * Non-secret AppRole definitions per namespace. One-time credential material is
 * never stored in this BFF metadata record.
 */
export const dynamic = "force-dynamic";

const key = (namespace: string) => `app-credentials::${namespace}`;
const MaxAppCredentialsBodyBytes = 64 * 1024;

type AppCredentialsPayload = { creds?: unknown[] };

function requestBodyFailure(error: unknown) {
  if (error instanceof RequestBodyError && error.status === 413) {
    return payloadTooLarge("The app-credentials request body is too large.");
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
    const creds =
      getConfig<unknown[]>(key(authorization.session.namespace)) ?? [];
    return asJsonResponse(success({ creds }));
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

  let payload: AppCredentialsPayload;
  try {
    const parsed = await parseJsonBody<unknown>(
      req,
      MaxAppCredentialsBodyBytes,
    );
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as AppCredentialsPayload).creds) ||
      !(parsed as AppCredentialsPayload).creds?.every(isAppCredential)
    ) {
      return asJsonResponse(
        invalidRequest("creds must be an array of valid app credentials."),
      );
    }
    payload = parsed as AppCredentialsPayload;
  } catch (error) {
    return asJsonResponse(requestBodyFailure(error));
  }

  if (!Array.isArray(payload.creds)) {
    return asJsonResponse(invalidRequest("creds must be an array."));
  }

  try {
    setConfig(key(session.namespace), payload.creds);
    return asJsonResponse(success({ creds: payload.creds }));
  } catch {
    return asJsonResponse(serviceUnavailable(Dependency.Storage));
  }
}
