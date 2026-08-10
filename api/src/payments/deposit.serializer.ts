import type { Deposit } from "@prisma/client";
import type { DepositDto } from "./types.js";

export function serializeDeposit(row: Deposit): DepositDto {
  return {
    id: row.id,
    status: row.status,
    amountCents: row.amountCents,
    currencyCode: row.currencyCode,
    providerId: row.providerId,
    paymentMethodId: row.paymentMethodId,
    paymentMethodName: row.paymentMethodName,
    externalRef: row.externalRef,
    failedReason: row.failedReason,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export function extractInitiateMessage(providerPayload: unknown): string | undefined {
  if (!providerPayload || typeof providerPayload !== "object") return undefined;
  const msg = (providerPayload as { message?: unknown }).message;
  return typeof msg === "string" ? msg : undefined;
}
