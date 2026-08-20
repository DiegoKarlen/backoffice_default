import { createHmac, timingSafeEqual } from "node:crypto";

/** Header sent by Mixer Gaming (wiki §3.5). */
export const MIXER_WEBHOOK_SIGNATURE_HEADER = "x-signature";

export type MixerWebhookTransactionFields = {
  id?: unknown;
  amount?: unknown;
  currency?: unknown;
  user_id?: unknown;
};

/**
 * Builds `{id}_{amount}_{currency}_{user_id}` using field values as received in the JSON body
 * (after parse). Mixer signs the same concatenation — no reformatting.
 */
export function buildMixerWebhookSignaturePayload(
  transaction: MixerWebhookTransactionFields,
): string | null {
  const { id, amount, currency, user_id: userId } = transaction;

  if (id === undefined || id === null || String(id).trim() === "") return null;
  if (amount === undefined || amount === null || String(amount).trim() === "") return null;
  if (currency === undefined || currency === null || String(currency).trim() === "") return null;
  if (userId === undefined || userId === null || String(userId).trim() === "") return null;

  return `${id}_${amount}_${currency}_${userId}`;
}

/** HMAC-SHA256 hex digest (lowercase), per Mixer wiki §3.5. */
export function computeMixerWebhookSignatureHex(payload: string, webhookSecret: string): string {
  return createHmac("sha256", webhookSecret).update(payload, "utf8").digest("hex").toLowerCase();
}

export function mixerWebhookSignatureFromBody(
  body: unknown,
  webhookSecret: string,
): string | null {
  if (!body || typeof body !== "object") return null;
  const transaction = (body as { transaction?: unknown }).transaction;
  if (!transaction || typeof transaction !== "object" || Array.isArray(transaction)) {
    return null;
  }
  const payload = buildMixerWebhookSignaturePayload(
    transaction as MixerWebhookTransactionFields,
  );
  if (!payload) return null;
  return computeMixerWebhookSignatureHex(payload, webhookSecret);
}

export function mixerWebhookSignaturesMatch(
  provided: string | undefined,
  expectedHex: string,
): boolean {
  if (!provided || !expectedHex) return false;
  const a = Buffer.from(provided.trim().toLowerCase(), "utf8");
  const b = Buffer.from(expectedHex.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
