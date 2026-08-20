/**
 * Calcula X-Signature para probar POST /webhooks/payments/mixer-gaming en Swagger/Postman.
 *
 * Uso:
 *   npx tsx scripts/sign-mixer-webhook.ts
 *   npx tsx scripts/sign-mixer-webhook.ts --id 2447 --amount 10 --currency ARS --user-id 2001
 *
 * Requiere PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET en api/.env
 */
import dotenv from "dotenv";

dotenv.config({ override: true });
import {
  buildMixerWebhookSignaturePayload,
  computeMixerWebhookSignatureHex,
  MIXER_WEBHOOK_SIGNATURE_HEADER,
} from "../src/payments/providers/mixer-gaming/webhook-signature.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!;
  return fallback;
}

const secret = process.env.PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET?.trim();
if (!secret) {
  console.error("Falta PAYMENTS_MIXER_GAMING_WEBHOOK_SECRET en api/.env");
  process.exit(1);
}

const transaction = {
  id: Number(arg("--id", "2447")),
  user_id: arg("--user-id", "2001"),
  currency: arg("--currency", "ARS"),
  transaction_type: 1,
  amount: arg("--amount", "10"),
  payment_method: 84,
  payment_method_name: "PaymentTest",
  status: "approved",
};

const body = {
  success: true,
  status: "approved",
  transaction,
};

const payload = buildMixerWebhookSignaturePayload(transaction);
if (!payload) {
  console.error("No se pudo armar el payload de firma");
  process.exit(1);
}

const signature = computeMixerWebhookSignatureHex(payload, secret);

console.log("Payload firmado:", payload);
console.log("");
console.log(`Header ${MIXER_WEBHOOK_SIGNATURE_HEADER}:`, signature);
console.log("");
console.log("Body JSON:");
console.log(JSON.stringify(body, null, 2));
