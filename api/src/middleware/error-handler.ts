import type { NextFunction, Request, Response } from "express";
import { errorStatusAndMessage } from "../lib/errors.js";
import { logError } from "../lib/logger.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  const { status, body } = errorStatusAndMessage(err);
  if (status >= 500) {
    logError("api", "unhandled error", err);
  }
  res.status(status).json(body);
}
