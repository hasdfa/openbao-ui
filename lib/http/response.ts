export const HttpStatus = {
  Ok: 200,
  Created: 201,
  BadRequest: 400,
  Unauthenticated: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  PayloadTooLarge: 413,
  TooManyRequests: 429,
  InternalServerError: 500,
  BadGateway: 502,
  ServiceUnavailable: 503,
} as const;

export type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus];

export const HttpErrorCode = {
  InvalidRequest: "invalid_request",
  Unauthenticated: "unauthenticated",
  Forbidden: "forbidden",
  NotFound: "not_found",
  Conflict: "conflict",
  PayloadTooLarge: "payload_too_large",
  RateLimited: "rate_limited",
  DependencyUnavailable: "dependency_unavailable",
  Internal: "internal",
} as const;

export type HttpErrorCode = (typeof HttpErrorCode)[keyof typeof HttpErrorCode];

export const Dependency = {
  OpenBao: "openbao",
  Storage: "storage",
} as const;

export type Dependency = (typeof Dependency)[keyof typeof Dependency];

export type HttpSuccess<T> = {
  ok: true;
  data: T;
};

export type HttpFailure = {
  ok: false;
  error: {
    code: HttpErrorCode;
    message: string;
  };
};

export type HttpResult<T> = {
  status: HttpStatus;
  body: HttpSuccess<T> | HttpFailure;
};

export function asJsonResponse<T>(result: HttpResult<T>): Response {
  return Response.json(result.body, { status: result.status });
}

export function success<T>(data: T, status: HttpStatus = HttpStatus.Ok): HttpResult<T> {
  return { status, body: { ok: true, data } };
}

function failure(code: HttpErrorCode, message: string, status: HttpStatus): HttpResult<never> {
  return { status, body: { ok: false, error: { code, message } } };
}

export function invalidRequest(message: string): HttpResult<never> {
  return failure(HttpErrorCode.InvalidRequest, message, HttpStatus.BadRequest);
}

export function unauthorized(): HttpResult<never> {
  return failure(
    HttpErrorCode.Unauthenticated,
    "Authentication is required.",
    HttpStatus.Unauthenticated,
  );
}

export function forbidden(message = "You do not have permission to perform this action."): HttpResult<never> {
  return failure(HttpErrorCode.Forbidden, message, HttpStatus.Forbidden);
}

export function payloadTooLarge(message: string): HttpResult<never> {
  return failure(HttpErrorCode.PayloadTooLarge, message, HttpStatus.PayloadTooLarge);
}

export function rateLimited(): HttpResult<never> {
  return failure(HttpErrorCode.RateLimited, "Too many requests. Try again later.", HttpStatus.TooManyRequests);
}

export function serviceUnavailable(dependency: Dependency): HttpResult<never> {
  const serviceName = dependency === Dependency.OpenBao ? "OpenBao" : "storage";
  return failure(
    HttpErrorCode.DependencyUnavailable,
    `The ${serviceName} service is temporarily unavailable.`,
    HttpStatus.ServiceUnavailable,
  );
}

export function internalError(): HttpResult<never> {
  return failure(HttpErrorCode.Internal, "An unexpected server error occurred.", HttpStatus.InternalServerError);
}
