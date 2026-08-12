import { isCrossSiteRequest } from "@/lib/csrf";
import {
  asJsonResponse,
  Dependency,
  forbidden,
  serviceUnavailable,
  success,
  unauthorized,
} from "@/lib/http/response";
import { openbao, OpenBaoRequestError } from "@/lib/openbao";
import { clearToken, getToken, setToken } from "@/lib/session";

/** POST /ui2/api/auth/renew — renew-self and refresh the cookie lifetime. */
export async function POST(req: Request) {
  if (isCrossSiteRequest(req)) {
    return asJsonResponse(forbidden("Cross-site requests are not allowed."));
  }

  const token = await getToken();
  if (!token) {
    return asJsonResponse(unauthorized());
  }

  try {
    const renewal = await openbao.renewSelf(token);
    const ttl = renewal.auth.lease_duration;
    await setToken(renewal.auth.client_token || token, ttl);
    return asJsonResponse(success({ ttl }));
  } catch (error) {
    if (error instanceof OpenBaoRequestError && error.status === 403) {
      await clearToken();
      return asJsonResponse(unauthorized());
    }
    return asJsonResponse(serviceUnavailable(Dependency.OpenBao));
  }
}
