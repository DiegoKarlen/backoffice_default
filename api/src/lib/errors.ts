import type { ZodError } from "zod";

export class AppError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function zodErrorMessage(err: ZodError): string {
  const first = err.issues[0];
  if (!first) return "Validation failed";
  const path = first.path.length ? `${first.path.join(".")}: ` : "";
  return `${path}${first.message}`;
}

export function errorStatusAndMessage(err: unknown): { status: number; body: Record<string, unknown> } {
  if (isAppError(err)) {
    return {
      status: err.status,
      body: { error: err.message, ...(err.code ? { code: err.code } : {}) },
    };
  }
  if (err && typeof err === "object" && "name" in err) {
    if (err.name === "PrizeRemoveBlocked" || err.name === "PrizeAmountLocked") {
      return { status: 409, body: { error: err instanceof Error ? err.message : "Conflict" } };
    }
  }
  const zod = err as { issues?: unknown[] };
  if (Array.isArray(zod.issues)) {
    return { status: 400, body: { error: zodErrorMessage(err as ZodError) } };
  }
  return {
    status: 500,
    body: { error: err instanceof Error ? err.message : "Internal server error" },
  };
}
