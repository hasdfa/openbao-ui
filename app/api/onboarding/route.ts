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
import { authorizeMetadataRequest } from "@/lib/metadata-session";
import { parseJsonBody, RequestBodyError } from "@/lib/request-body";

/** Per-namespace progress for the non-secret getting-started checklist. */
export const dynamic = "force-dynamic";

const key = (namespace: string) => `onboarding::${namespace}`;
const MaxOnboardingBodyBytes = 16 * 1024;

type Onboarding = { dismissed?: boolean; steps?: Record<string, boolean> };

function isOnboarding(value: unknown): value is Onboarding {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.dismissed !== undefined && typeof candidate.dismissed !== "boolean") return false;
  return (
    candidate.steps === undefined ||
    (typeof candidate.steps === "object" &&
      candidate.steps !== null &&
      Object.values(candidate.steps).every((step) => typeof step === "boolean"))
  );
}

function requestBodyFailure(error: unknown) {
  if (error instanceof RequestBodyError && error.status === 413) {
    return payloadTooLarge("The onboarding request body is too large.");
  }
  return invalidRequest("The request body must be valid JSON.");
}

export async function GET(req: NextRequest) {
  const authorization = await authorizeMetadataRequest(req.headers);
  if (authorization.response) return authorization.response;
  try {
    const onboarding = getConfig<Onboarding>(key(authorization.session.namespace)) ?? {};
    return asJsonResponse(success({ onboarding }));
  } catch {
    return asJsonResponse(serviceUnavailable(Dependency.Storage));
  }
}

export async function PUT(req: NextRequest) {
  const authorization = await authorizeMetadataRequest(req.headers);
  if (authorization.response) return authorization.response;
  if (isCrossSiteRequest(req)) {
    return asJsonResponse(forbidden("Cross-site requests are not allowed."));
  }

  let patch: unknown;
  try {
    patch = await parseJsonBody<unknown>(req, MaxOnboardingBodyBytes);
  } catch (error) {
    return asJsonResponse(requestBodyFailure(error));
  }
  if (!isOnboarding(patch)) {
    return asJsonResponse(invalidRequest("onboarding data is invalid."));
  }

  try {
    const storageKey = key(authorization.session.namespace);
    const current = getConfig<Onboarding>(storageKey) ?? {};
    const onboarding: Onboarding = {
      ...current,
      ...(patch.dismissed === undefined ? {} : { dismissed: patch.dismissed }),
      steps: { ...current.steps, ...patch.steps },
    };
    setConfig(storageKey, onboarding);
    return asJsonResponse(success({ onboarding }));
  } catch {
    return asJsonResponse(serviceUnavailable(Dependency.Storage));
  }
}
