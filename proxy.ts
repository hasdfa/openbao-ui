import { NextRequest, NextResponse } from "next/server";

import { BASE_PATH } from "@/lib/base-path";

const COOKIE_NAME = process.env.BAO_COOKIE_NAME ?? "bao_token";

/**
 * Gate authenticated app pages (Next 16 "proxy" convention, formerly
 * middleware). Unauthenticated requests to our app (/ui2/*) are redirected to
 * /ui2/login; the login page and the auth BFF routes stay open.
 *
 * NOTE: this only governs the app's basePath (/ui2). The `/ui/*` stock-UI proxy
 * and the `/v1/*` API proxy live outside basePath (next.config rewrites with
 * basePath:false) — we let `/ui/*` pass through untouched (OpenBao's own UI
 * handles its own auth), and the unauthenticated bootstrap/discovery calls the
 * login and seal flows make reach OpenBao directly, by design.
 */
export function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  // OpenBao's stock UI lives at /ui/* (proxied to OpenBao). Let it through — it
  // is not our app and authenticates itself. Note `/ui2/...` does NOT match
  // `startsWith("/ui/")`, so our app is still gated below.
  if (pathname === "/ui" || pathname.startsWith("/ui/")) {
    return NextResponse.next();
  }

  // Normalize away our basePath so the allow-list works regardless of whether
  // Next includes it in the pathname for this runtime version.
  const rel = pathname.replace(new RegExp(`^${BASE_PATH}`), "") || "/";

  // API routes self-authenticate and return JSON status codes (never redirect
  // an XHR to the login HTML); only page navigations are gated here. Static
  // assets in public/ (e.g. the logo SVGs) must not be redirected either.
  const isAsset = /\.(svg|png|jpe?g|gif|ico|webp|woff2?|css|js|map|txt)$/i.test(rel);
  // /v1/* is the unauthenticated OpenBao proxy used by the seal/bootstrap and
  // login-discovery flows. It already sits outside basePath (so this normally
  // doesn't run on it), but exempt it explicitly as defense in depth.
  const isPublic =
    rel === "/login" ||
    rel.startsWith("/login/") ||
    rel.startsWith("/api/") ||
    rel === "/v1" ||
    rel.startsWith("/v1/") ||
    isAsset;

  if (isPublic) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    const login = new URL(`${BASE_PATH}/login`, req.url);
    // bring the user back to the page they asked for once they sign in
    login.searchParams.set("next", `${BASE_PATH}${rel === "/" ? "" : rel}${req.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
