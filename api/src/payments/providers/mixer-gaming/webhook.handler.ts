import { parseMoneyToCents } from "./client.js";
import type { WebhookDepositEvent } from "../../types.js";

/** MixerGaming transaction_type = 1 → depósito (credit). */
const DEPOSIT_TRANSACTION_TYPE = 1;

type MixerTransactionRow = {
  id?: number | string;
  transaction_type?: number | string;
  amount?: number | string;
};

type MixerWebhookBody = {
  success?: boolean;
  transaction?: MixerTransactionRow[] | MixerTransactionRow;
};

function normalizeTransactionList(body: MixerWebhookBody): MixerTransactionRow[] {
  if (Array.isArray(body.transaction)) return body.transaction;
  if (body.transaction && typeof body.transaction === "object") return [body.transaction];
  return [];
}

export function parseMixerGamingWebhook(rawBody: unknown): WebhookDepositEvent {
  if (!rawBody || typeof rawBody !== "object") {
    throw new Error("Invalid webhook body");
  }

  const body = rawBody as MixerWebhookBody;
  if (typeof body.success !== "boolean") {
    throw new Error("Invalid webhook: missing success flag");
  }

  const rows = normalizeTransactionList(body);
  if (!rows.length) {
    throw new Error("Invalid webhook: missing transaction data");
  }

  const tx = rows[0];
  if (tx.id === undefined || tx.id === null || String(tx.id).trim() === "") {
    throw new Error("Invalid webhook: missing transaction id");
  }

  const txType = Number(tx.transaction_type);
  if (Number.isFinite(txType) && txType !== DEPOSIT_TRANSACTION_TYPE) {
    throw new Error(`Unsupported transaction_type: ${txType}`);
  }

  const amountCents =
    tx.amount !== undefined && tx.amount !== null ? parseMoneyToCents(String(tx.amount)) : undefined;

  return {
    externalRef: String(tx.id),
    success: body.success,
    amountCents,
    failedReason: body.success ? undefined : "Gateway reported payment failure",
    providerPayload: rawBody,
  };
}
