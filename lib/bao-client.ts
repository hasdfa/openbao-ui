"use client";

import { API_BASE } from "@/lib/base-path";

// Thin client-side wrapper around the BFF proxy (<basePath>/api/bao). Adds the
// namespace header, encodes LIST as ?list=true, and normalizes OpenBao errors.
const BASE = `${API_BASE}/bao`;

/** Parse a body as JSON, returning null for empty/non-JSON payloads so a
 *  non-JSON error response still becomes a BaoError rather than a throw. */
function parseJsonSafe(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type LocalProxyFailure = {
  ok: false;
  error: { code: string; message: string };
};

function isLocalProxyFailure(value: unknown): value is LocalProxyFailure {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.ok !== false || typeof candidate.error !== "object" || candidate.error === null) {
    return false;
  }
  const error = candidate.error as Record<string, unknown>;
  return typeof error.code === "string" && typeof error.message === "string";
}
export class BaoError extends Error {
  status: number;
  errors: string[];
  constructor(status: number, errors: string[]) {
    super(errors[0] ?? `Request failed (${status})`);
    this.name = "BaoError";
    this.status = status;
    this.errors = errors;
  }
}

export type BaoRequest = {
  path: string; // OpenBao path without /v1, e.g. "secret/data/foo"
  method?: string;
  body?: unknown;
  namespace?: string;
  list?: boolean;
  query?: Record<string, string | number | undefined>;
};

export async function baoFetch<T = unknown>({
  path,
  method = "GET",
  body,
  namespace,
  list,
  query,
}: BaoRequest): Promise<T> {
  const params = new URLSearchParams();
  if (list) params.set("list", "true");
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) params.set(k, String(v));
  }
  const qs = params.toString();
  // Percent-encode each path segment so secret names containing URL delimiters
  // (#, ?, %, …) reach the BFF intact instead of being parsed as a fragment or
  // query. Slashes stay as separators (the [...path] route re-encodes upstream).
  const encodedPath = path
    .replace(/^\/+/, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const url = `${BASE}/${encodedPath}${qs ? `?${qs}` : ""}`;

  const headers: Record<string, string> = {};
  if (namespace) headers["X-Vault-Namespace"] = namespace;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  // Tolerate non-JSON bodies (502 HTML, empty responses) so they surface as a
  // BaoError via the status check below instead of throwing a parse error.
  const data = parseJsonSafe(text);

  if (!res.ok) {
    const errors: string[] = Array.isArray(data?.errors) && data.errors.every((error: unknown) => typeof error === "string")
      ? data.errors
      : isLocalProxyFailure(data)
        ? [data.error.message]
        : [`Request failed (${res.status})`];
    throw new BaoError(res.status, errors);
  }
  return data as T;
}
