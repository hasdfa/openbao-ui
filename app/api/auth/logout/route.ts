import { isCrossSiteRequest } from "@/lib/csrf";
import { asJsonResponse, forbidden, success } from "@/lib/http/response";
import { openbao } from "@/lib/openbao";
import { clearToken, getToken } from "@/lib/session";

/** Ends the local session even if the upstream token revocation cannot complete. */
export async function POST(req: Request) {
  if (isCrossSiteRequest(req)) {
    return asJsonResponse(forbidden("Cross-site requests are not allowed."));
  }
  const token = await getToken();
  if (token) {
    try {
      await openbao.revokeSelf(token);
    } catch {
      // Cookie removal is the authoritative local-session boundary.
    }
  }
  await clearToken();
  return asJsonResponse(success({}));
}
