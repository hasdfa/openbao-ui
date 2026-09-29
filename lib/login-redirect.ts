import { BASE_PATH } from "@/lib/base-path";

/** Only same-app paths: an open redirect on a login page is a phishing aid. */
export function safeNext(next: string | null | undefined): string {
  if (!next || next.startsWith("//") || next.includes("\\")) return BASE_PATH;
  if (next !== BASE_PATH && !next.startsWith(`${BASE_PATH}/`)) return BASE_PATH;
  if (next.startsWith(`${BASE_PATH}/login`)) return BASE_PATH;
  return next;
}

/** Send an expired session to login, remembering where the user was. */
export function toLogin() {
  if (typeof window === "undefined") return;
  const here = window.location.pathname + window.location.search;
  if (here.startsWith(`${BASE_PATH}/login`)) return;
  window.location.assign(`${BASE_PATH}/login?next=${encodeURIComponent(safeNext(here))}`);
}
