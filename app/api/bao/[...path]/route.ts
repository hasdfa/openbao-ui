import { NextRequest, NextResponse } from "next/server";

import { isCrossSiteRequest } from "@/lib/csrf";
import {
  asJsonResponse,
  Dependency,
  forbidden,
  invalidRequest,
  payloadTooLarge,
  serviceUnavailable,
  unauthorized,
} from "@/lib/http/response";
import { OPENBAO_ADDR } from "@/lib/openbao";
import { readTextBody, RequestBodyError } from "@/lib/request-body";
import {
  readBoundedResponseBody,
  ResponseBodyLimitError,
} from "@/lib/response-body";
import { getValidatedToken } from "@/lib/session";

const MaxProxyBodyBytes = 2 * 1024 * 1024;
const MaxProxyResponseBytes = 4 * 1024 * 1024;
const OpenBaoProxyTimeoutMs = 10_000;

async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const namespace = req.headers.get("x-vault-namespace") ?? "";
  let token: string | undefined;
  try {
    token = await getValidatedToken(namespace);
  } catch {
    return asJsonResponse(serviceUnavailable(Dependency.OpenBao));
  }
  if (!token) return asJsonResponse(unauthorized());
  if (req.method !== "GET" && req.method !== "HEAD" && isCrossSiteRequest(req))
    return asJsonResponse(forbidden("Cross-site requests are not allowed."));

  const { path } = await ctx.params;
  if (path.some((segment) => segment === "." || segment === ".."))
    return asJsonResponse(invalidRequest("The OpenBao path is invalid."));
  const url = `${OPENBAO_ADDR}/v1/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = { "X-Vault-Token": token };
  if (namespace) headers["X-Vault-Namespace"] = namespace;

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let body: string | undefined;
  if (hasBody) {
    try {
      body = await readTextBody(req, MaxProxyBodyBytes);
    } catch (error) {
      return asJsonResponse(
        error instanceof RequestBodyError && error.status === 413
          ? payloadTooLarge("The request body is too large.")
          : invalidRequest("The request body is invalid."),
      );
    }
    if (body) headers["Content-Type"] = "application/json";
  }
  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(OpenBaoProxyTimeoutMs),
    });
  } catch {
    return asJsonResponse(serviceUnavailable(Dependency.OpenBao));
  }

  let responseBody: Uint8Array;
  try {
    responseBody = await readBoundedResponseBody(
      upstream,
      MaxProxyResponseBytes,
    );
  } catch (error) {
    if (error instanceof ResponseBodyLimitError) {
      return asJsonResponse(serviceUnavailable(Dependency.OpenBao));
    }
    throw error;
  }
  const contentType = upstream.headers.get("content-type");
  return new NextResponse(
    responseBody.byteLength === 0 ? null : Buffer.from(responseBody),
    {
      status: upstream.status,
      headers: contentType ? { "Content-Type": contentType } : undefined,
    },
  );
}

export {
  handle as DELETE,
  handle as GET,
  handle as PATCH,
  handle as POST,
  handle as PUT,
};
