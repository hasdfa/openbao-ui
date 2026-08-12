export class ResponseBodyLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Response body exceeds ${limit} bytes.`);
    this.name = "ResponseBodyLimitError";
  }
}

function contentLength(response: Response): number | undefined {
  const value = response.headers.get("content-length");
  if (!value) return undefined;
  const length = Number(value);
  return Number.isSafeInteger(length) && length >= 0 ? length : undefined;
}

/** Reads a response as bytes without allowing an upstream to allocate unbounded memory. */
export async function readBoundedResponseBody(
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  const declaredLength = contentLength(response);
  if (declaredLength !== undefined && declaredLength > limit) {
    await response.body?.cancel();
    throw new ResponseBodyLimitError(limit);
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new ResponseBodyLimitError(limit);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
