import { isCrossSiteRequest } from "@/lib/csrf";
import {
  asJsonResponse,
  Dependency,
  forbidden,
  invalidRequest,
  payloadTooLarge,
  rateLimited,
  serviceUnavailable,
  success,
} from "@/lib/http/response";
import { openbao, OpenBaoRequestError } from "@/lib/openbao";
import { FixedWindowRateLimiter } from "@/lib/rate-limit";
import { parseJsonBody, RequestBodyError } from "@/lib/request-body";
import { setToken } from "@/lib/session";

type LoginBody =
  | { method: "token"; token: string }
  | { method: "userpass"; mount?: string; username: string; password: string }
  | { method: "ldap"; mount?: string; username: string; password: string }
  | { method: "approle"; mount?: string; roleId: string; secretId: string };
type LoginSuccess = { displayName?: string; policies: string[] };
const DefaultLoginRateLimit = 10;
const LoginRateLimitWindowMs = 60_000;
const MaxLoginBodyBytes = 16 * 1024;

function readLoginRateLimit(): number {
  const raw = process.env.BAO_LOGIN_RATE_LIMIT;
  if (raw === undefined) return DefaultLoginRateLimit;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
    throw new Error("BAO_LOGIN_RATE_LIMIT must be an integer from 1 through 10000.");
  }
  return value;
}

const loginRateLimiter = new FixedWindowRateLimiter(
  readLoginRateLimit(),
  LoginRateLimitWindowMs,
);

function isLoginBody(value: unknown): value is LoginBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  const isOptionalString = (field: unknown) =>
    field === undefined || typeof field === "string";
  switch (body.method) {
    case "token":
      return typeof body.token === "string";
    case "userpass":
    case "ldap":
      return (
        typeof body.username === "string" &&
        typeof body.password === "string" &&
        isOptionalString(body.mount)
      );
    case "approle":
      return (
        typeof body.roleId === "string" &&
        typeof body.secretId === "string" &&
        isOptionalString(body.mount)
      );
    default:
      return false;
  }
}
function loginRateLimitKey(body: LoginBody): string {
  if (body.method === "userpass" || body.method === "ldap") {
    return `${body.method}:${body.mount ?? body.method}:${body.username}`;
  }
  if (body.method === "approle")
    return `approle:${body.mount ?? "approle"}:${body.roleId}`;
  return "token";
}
function bodyFailure(error: unknown) {
  return error instanceof RequestBodyError && error.status === 413
    ? payloadTooLarge("The login request body is too large.")
    : invalidRequest("The login request body is invalid.");
}
function authFailure(error: unknown) {
  if (error instanceof OpenBaoRequestError) {
    if (error.status === 400) {
      return invalidRequest("OpenBao rejected the authentication request.");
    }
    if (error.status === 403) {
      return forbidden("OpenBao denied the authentication request.");
    }
  }
  return serviceUnavailable(Dependency.OpenBao);
}

export async function POST(req: Request) {
  if (isCrossSiteRequest(req))
    return asJsonResponse(forbidden("Cross-site requests are not allowed."));
  let body: LoginBody;
  try {
    const parsed = await parseJsonBody<unknown>(req, MaxLoginBodyBytes);
    if (!isLoginBody(parsed))
      return asJsonResponse(
        invalidRequest("The login request body is invalid."),
      );
    body = parsed;
  } catch (error) {
    return asJsonResponse(bodyFailure(error));
  }
  if (!loginRateLimiter.consume(loginRateLimitKey(body)))
    return asJsonResponse(rateLimited());

  try {
    if (body.method === "token") {
      const token = body.token.trim();
      if (!token) return asJsonResponse(invalidRequest("A token is required."));
      const lookup = await openbao.lookupSelf(token);
      await setToken(token, lookup.data.ttl);
      return asJsonResponse(
        success<LoginSuccess>({
          displayName: lookup.data.display_name,
          policies: lookup.data.policies,
        }),
      );
    }
    if (body.method === "userpass" || body.method === "ldap") {
      if (!body.username || !body.password)
        return asJsonResponse(
          invalidRequest("Username and password are required."),
        );
      const result =
        body.method === "ldap"
          ? await openbao.ldapLogin(
              body.mount || "ldap",
              body.username,
              body.password,
            )
          : await openbao.userpassLogin(
              body.mount || "userpass",
              body.username,
              body.password,
            );
      await setToken(result.auth.client_token, result.auth.lease_duration);
      return asJsonResponse(
        success<LoginSuccess>({
          displayName: body.username,
          policies: result.auth.policies,
        }),
      );
    }
    if (!body.roleId || !body.secretId)
      return asJsonResponse(
        invalidRequest("Role ID and secret ID are required."),
      );
    const result = await openbao.approleLogin(
      body.mount || "approle",
      body.roleId,
      body.secretId,
    );
    await setToken(result.auth.client_token, result.auth.lease_duration);
    return asJsonResponse(
      success<LoginSuccess>({
        displayName: "approle",
        policies: result.auth.policies,
      }),
    );
  } catch (error) {
    return asJsonResponse(authFailure(error));
  }
}
