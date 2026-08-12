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
  unauthorized,
} from "@/lib/http/response";
import { OpenBaoRequestError } from "@/lib/openbao";
import { configuredOrigin } from "@/lib/request-origin";
import { parseJsonBody, RequestBodyError } from "@/lib/request-body";
import { getValidatedToken } from "@/lib/session";
import { isOperator } from "@/lib/ui-admin";

/** Public login branding and root-operator managed server-global configuration. */
export const dynamic = "force-dynamic";

const ConfigKey = "ui";
const MaxUiConfigBodyBytes = 16 * 1024;
const PublicUiConfigKey = {
  Branding: "branding",
  DefaultLoginMethod: "defaultLoginMethod",
  HideTokenLogin: "hideTokenLogin",
  LoginMethodOrder: "loginMethodOrder",
} as const;
const PublicUiConfigKeys = Object.values(PublicUiConfigKey);
type UiConfig = Record<string, unknown>;

function publicConfig(config: UiConfig): UiConfig {
  const result: UiConfig = {};
  for (const key of PublicUiConfigKeys) {
    if (key in config) result[key] = config[key];
  }
  const publicUrl = configuredOrigin();
  return publicUrl ? { ...result, publicUrl } : result;
}

function requestBodyFailure(error: unknown) {
  if (error instanceof RequestBodyError && error.status === 413) {
    return payloadTooLarge("The UI configuration request body is too large.");
  }
  return invalidRequest("The request body must be valid JSON.");
}

export async function GET() {
  try {
    return asJsonResponse(success({ config: publicConfig(getConfig<UiConfig>(ConfigKey) ?? {}) }));
  } catch {
    return asJsonResponse(serviceUnavailable(Dependency.Storage));
  }
}

export async function PUT(req: NextRequest) {
  let token: string | undefined;
  try {
    token = await getValidatedToken("");
  } catch (error) {
    if (error instanceof OpenBaoRequestError) {
      return asJsonResponse(serviceUnavailable(Dependency.OpenBao));
    }
    throw error;
  }
  if (!token) return asJsonResponse(unauthorized());
  if (isCrossSiteRequest(req)) return asJsonResponse(forbidden("Cross-site requests are not allowed."));

  try {
    if (!(await isOperator(token, ""))) return asJsonResponse(forbidden("Root operator permission is required."));
  } catch (error) {
    if (error instanceof OpenBaoRequestError) return asJsonResponse(serviceUnavailable(Dependency.OpenBao));
    throw error;
  }

  let body: unknown;
  try {
    body = await parseJsonBody<unknown>(req, MaxUiConfigBodyBytes);
  } catch (error) {
    return asJsonResponse(requestBodyFailure(error));
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return asJsonResponse(invalidRequest("The UI configuration must be a JSON object."));
  }

  try {
    const config = { ...(getConfig<UiConfig>(ConfigKey) ?? {}), ...(body as UiConfig) };
    setConfig(ConfigKey, config);
    return asJsonResponse(success({ config }));
  } catch {
    return asJsonResponse(serviceUnavailable(Dependency.Storage));
  }
}
