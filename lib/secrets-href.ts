/**
 * In-app URL for a mount + path. Each segment is encoded (a key named `a#b`
 * or `50%` must survive the round trip) while the slashes between them stay.
 */
export function secretsHref(...parts: string[]): string {
  const segs = parts.join("/").split("/").filter(Boolean).map(encodeURIComponent);
  return `/secrets/${segs.join("/")}`;
}

/** decodeURIComponent that never throws on a malformed `%` in a hand-typed URL. */
export function safeDecode(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}
