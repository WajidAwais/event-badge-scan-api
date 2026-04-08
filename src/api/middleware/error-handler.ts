import type { NextFunction, Request, Response } from "express";
import { z, ZodError } from "zod";
import { logger } from "../../utils/logger.js";
import { AppError } from "../errors/app-error.js";
import { sendFailure } from "../utils/respond.js";

/** When not "true", responses avoid leaking internals (generic 500, no stack). Set API_DEBUG_ERRORS=true to expose. */
function hideDebugInfo(): boolean {
  return process.env["API_DEBUG_ERRORS"] !== "true";
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  if (err instanceof ZodError) {
    sendFailure(res, 422, {
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: z.flattenError(err),
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(
        { err, code: err.code, statusCode: err.statusCode },
        "Application error (5xx)",
      );
    }

    sendFailure(res, err.statusCode, {
      code: err.code,
      message: err.message,
      details: err.details ?? null,
    });
    return;
  }

  const unknown = err instanceof Error ? err : new Error(String(err));

  logger.error({ err: unknown }, "Unhandled error");

  const safe = hideDebugInfo();
  sendFailure(res, 500, {
    code: "INTERNAL_ERROR",
    message: safe ? "An unexpected error occurred" : unknown.message,
    details: safe ? null : { stack: unknown.stack ?? null },
  });
}

