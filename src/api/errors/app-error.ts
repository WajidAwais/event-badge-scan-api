/**
 * HTTP error with a stable machine `code` and optional `details`, thrown from route
 * handlers and mapped to the response envelope by the error middleware.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;

  constructor(statusCode: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details: unknown = null, code = "NOT_FOUND") {
    super(404, code, message, details);
    this.name = "NotFoundError";
  }
}
