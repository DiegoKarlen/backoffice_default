import type { ZodError } from "zod";
import { AppError } from "./errors.js";

export function httpError(
  status: number,
  message: string,
  options?: { code?: string; jsonBody?: Record<string, unknown> },
): AppError {
  return new AppError(status, message, options);
}

/** Preserves `{ error: flatten() }` responses used by admin forms. */
export function zodFlattenError(err: ZodError): AppError {
  return new AppError(400, "Validation failed", { jsonBody: { error: err.flatten() } });
}

export function rethrowBingoMutationError(e: unknown): never {
  if (e instanceof Error && (e.name === "PrizeRemoveBlocked" || e.name === "PrizeAmountLocked")) {
    throw httpError(409, e.message);
  }
  const statusCode = (e as { statusCode?: number }).statusCode;
  if (statusCode === 400) {
    throw httpError(400, e instanceof Error ? e.message : "Bad request");
  }
  throw e;
}

const PLAYER_NOT_FOUND = "Player not found";
const PLAYER_INACTIVE = "Player is inactive";
export function rethrowPlayerWalletError(e: unknown): never {
  const msg = e instanceof Error ? e.message : "Request failed";
  if (
    msg === PLAYER_NOT_FOUND ||
    msg === "Prize not found" ||
    msg === "Player round card not found"
  ) {
    throw httpError(404, msg);
  }
  if (
    msg === PLAYER_INACTIVE ||
    msg.includes("does not belong") ||
    msg.includes("does not match") ||
    msg === "Prize already credited for this card"
  ) {
    throw httpError(409, msg);
  }
  if (msg === "Prize win not registered by game engine") {
    throw httpError(404, msg);
  }
  if (
    msg.includes("amountCents") ||
    msg.includes("maximum") ||
    msg.includes("positive integer")
  ) {
    throw httpError(400, msg);
  }
  throw e;
}

export function rethrowCartonPurchaseError(e: unknown): never {
  const msg = e instanceof Error ? e.message : "Purchase failed";
  if (msg === "Insufficient balance") {
    throw httpError(402, msg);
  }
  if (msg === "Player not found" || msg === "Player is inactive" || msg === "Round not found") {
    throw httpError(404, msg);
  }
  if (
    msg.includes("not active") ||
    msg.includes("not open") ||
    msg.includes("Only BINGO_75") ||
    msg.includes("quantity")
  ) {
    throw httpError(400, msg);
  }
  throw e;
}
