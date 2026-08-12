import { openbao, OpenBaoRequestError } from "@/lib/openbao";
import {
  asJsonResponse,
  Dependency,
  serviceUnavailable,
  success,
  unauthorized,
} from "@/lib/http/response";
import { clearToken, getToken } from "@/lib/session";

/**
 * GET /ui2/api/auth/session — returns information about the current token.
 * An invalid token is removed from the local session; unavailable OpenBao is a
 * dependency failure rather than an authentication failure.
 */
export async function GET() {
  const token = await getToken();
  if (!token) {
    return asJsonResponse(unauthorized());
  }

  try {
    const lookup = await openbao.lookupSelf(token);
    return asJsonResponse(
      success({
        displayName: lookup.data.display_name,
        policies: lookup.data.policies,
        ttl: lookup.data.ttl,
        renewable: lookup.data.renewable,
      }),
    );
  } catch (error) {
    if (error instanceof OpenBaoRequestError && error.status === 403) {
      await clearToken();
      return asJsonResponse(unauthorized());
    }
    return asJsonResponse(serviceUnavailable(Dependency.OpenBao));
  }
}
