export class RequestBodyError extends Error {
  constructor(
    readonly status: 400 | 413,
    message: string,
  ) {
    super(message);
    this.name = "RequestBodyError";
  }
}

export async function readTextBody(req: Request, maxBytes: number): Promise<string> {
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyError(413, "request body too large");
  }
  if (!req.body) return "";

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RequestBodyError(413, "request body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** Parse a JSON request body without accepting unbounded input into memory. */
export async function parseJsonBody<T>(req: Request, maxBytes: number): Promise<T> {
  const text = await readTextBody(req, maxBytes);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new RequestBodyError(400, "invalid JSON");
  }
}
