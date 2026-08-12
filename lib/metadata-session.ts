import {
  asJsonResponse,
  Dependency,
  forbidden,
  serviceUnavailable,
  unauthorized,
} from "@/lib/http/response";
import { OpenBaoRequestError } from "@/lib/openbao";
import { getValidatedToken } from "@/lib/session";
import { isOperator } from "@/lib/ui-admin";

export type ValidatedMetadataSession = {
  namespace: string;
  token: string;
};

export type MetadataAuthorization =
  | { session: ValidatedMetadataSession; response: undefined }
  | { session: undefined; response: Response };

/**
 * Validates a metadata request in the same namespace before reading or writing
 * local UI state. The client-controlled namespace is part of token validation.
 */
export async function authorizeMetadataRequest(
  headers: Headers,
): Promise<MetadataAuthorization> {
  const namespace = headers.get("x-vault-namespace") ?? "";
  try {
    const token = await getValidatedToken(namespace);
    if (!token) {
      return { session: undefined, response: asJsonResponse(unauthorized()) };
    }
    return { session: { namespace, token }, response: undefined };
  } catch (error) {
    if (error instanceof OpenBaoRequestError) {
      return {
        session: undefined,
        response: asJsonResponse(serviceUnavailable(Dependency.OpenBao)),
      };
    }
    throw error;
  }
}

/**
 * Enforces OpenBao's operator authorization for sensitive metadata access
 * without turning an unavailable dependency into a false permission denial.
 */
export async function authorizeMetadataOperator(
  session: ValidatedMetadataSession,
): Promise<Response | undefined> {
  try {
    if (await isOperator(session.token, session.namespace)) {
      return undefined;
    }
    return asJsonResponse(forbidden("Operator permission is required."));
  } catch (error) {
    if (error instanceof OpenBaoRequestError) {
      return asJsonResponse(serviceUnavailable(Dependency.OpenBao));
    }
    throw error;
  }
}
