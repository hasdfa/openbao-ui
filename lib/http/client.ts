import { HttpErrorCode, type HttpFailure, type HttpSuccess } from "@/lib/http/response";

export const HttpClientErrorCode = {
  InvalidResponse: "invalid_response",
} as const;

export type HttpClientErrorCode =
  | HttpErrorCode
  | (typeof HttpClientErrorCode)[keyof typeof HttpClientErrorCode];

export class HttpClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: HttpClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpClientError";
  }
}

function isSuccessEnvelope(value: unknown): value is HttpSuccess<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    value.ok === true &&
    "data" in value
  );
}

function isHttpErrorCode(value: unknown): value is HttpErrorCode {
  return typeof value === "string" && Object.values(HttpErrorCode).includes(value as HttpErrorCode);
}

function isFailureEnvelope(value: unknown): value is HttpFailure {
  if (typeof value !== "object" || value === null || !("ok" in value) || value.ok !== false) {
    return false;
  }
  if (!("error" in value) || typeof value.error !== "object" || value.error === null) {
    return false;
  }
  const { error } = value;
  return (
    "code" in error &&
    isHttpErrorCode(error.code) &&
    "message" in error &&
    typeof error.message === "string"
  );
}

export async function readHttpEnvelope<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HttpClientError(
      response.status,
      HttpClientErrorCode.InvalidResponse,
      "The server returned an invalid JSON response.",
    );
  }

  if (isSuccessEnvelope(payload)) {
    if (!response.ok) {
      throw new HttpClientError(
        response.status,
        HttpClientErrorCode.InvalidResponse,
        "The server returned a successful envelope with an error status.",
      );
    }
    return payload.data as T;
  }

  if (isFailureEnvelope(payload)) {
    if (response.ok) {
      throw new HttpClientError(
        response.status,
        HttpClientErrorCode.InvalidResponse,
        "The server returned a failure envelope with a successful status.",
      );
    }
    throw new HttpClientError(response.status, payload.error.code, payload.error.message);
  }

  throw new HttpClientError(
    response.status,
    HttpClientErrorCode.InvalidResponse,
    "The server returned a response that does not match the application contract.",
  );
}
