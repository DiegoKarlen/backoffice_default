/**
 * Prueba E2E depósito stub + webhook (sin MixerGaming ni ngrok).
 * Requiere: API en marcha, PAYMENTS_ENABLED=1 (default).
 *
 * Uso:
 *   npx tsx scripts/run-deposit-webhook-test.ts
 *   API_BASE_URL=https://xxx.ngrok-free.app npx tsx scripts/run-deposit-webhook-test.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const API = process.env.API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:4001";
const STUB_METHOD_ID = "stub-transfer";
const DEPOSIT_CENTS = 100_000;

const prisma = new PrismaClient();

function fail(msg: string, detail?: unknown): never {
  console.error(msg, detail ?? "");
  process.exit(1);
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    fail(`HTTP ${res.status} ${path}`, body);
  }
  return body as T;
}

const suffix = Date.now().toString(36);
const email = `deposit-test-${suffix}@example.com`;
const username = `dep_${suffix}`;
const password = "TestPass123!";

console.log("API:", API);
console.log("1) Registrar jugador de prueba…");

const reg = await jsonFetch<{ accessToken: string; player: { id: string } }>("/player/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, username, password }),
});

const token = reg.accessToken;
const auth = { Authorization: `Bearer ${token}` };

const walletBefore = await jsonFetch<{ wallet: { balanceCents: number } | null }>("/player/wallet", {
  headers: auth,
});
const balanceBefore = walletBefore.wallet?.balanceCents ?? 0;
console.log("   Saldo inicial:", balanceBefore, "centavos");

console.log("2) Listar métodos de pago…");
const methods = await jsonFetch<{ paymentMethods: { id: string; providerId: string }[] }>(
  "/player/deposits/payment-methods",
  { headers: auth },
);
const stubMethod = methods.paymentMethods.find((m) => m.id === STUB_METHOD_ID);
if (!stubMethod) {
  fail("No se encontró método stub-transfer. ¿PAYMENTS_ENABLED=0 o solo mixer-gaming sin stub?");
}
console.log("   Método:", stubMethod.id, `(${stubMethod.providerId})`);

console.log("3) Iniciar depósito PENDING…");
const initiated = await jsonFetch<{
  depositId: string;
  status: string;
}>("/player/deposits", {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({
    amountCents: DEPOSIT_CENTS,
    paymentMethodId: STUB_METHOD_ID,
    providerId: "stub",
  }),
});

if (initiated.status !== "PENDING") {
  fail("Depósito debería quedar PENDING", initiated);
}
console.log("   depositId:", initiated.depositId);

console.log("4) Webhook stub (success=true)…");
const webhookSecret = process.env.PAYMENTS_WEBHOOK_STUB_SECRET?.trim() || "dev-webhook-stub-secret";
const wh1 = await jsonFetch<{ ok: boolean; status?: string; alreadyProcessed?: boolean }>(
  "/webhooks/payments/stub",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Webhook-Secret": webhookSecret,
    },
    body: JSON.stringify({ depositId: initiated.depositId, success: true }),
  },
);
if (!wh1.ok || wh1.status !== "COMPLETED") {
  fail("Webhook no completó el depósito", wh1);
}
console.log("   Webhook OK → COMPLETED");

const walletAfter = await jsonFetch<{ wallet: { balanceCents: number } | null }>("/player/wallet", {
  headers: auth,
});
const balanceAfter = walletAfter.wallet?.balanceCents ?? 0;
console.log("5) Saldo tras acreditación:", balanceAfter, "centavos (+" + (balanceAfter - balanceBefore) + ")");

if (balanceAfter !== balanceBefore + DEPOSIT_CENTS) {
  fail("Saldo incorrecto", { balanceBefore, balanceAfter, expected: balanceBefore + DEPOSIT_CENTS });
}

console.log("6) Webhook duplicado (idempotencia)…");
const wh2 = await jsonFetch<{ ok: boolean; alreadyProcessed?: boolean }>("/webhooks/payments/stub", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Webhook-Secret": webhookSecret,
  },
  body: JSON.stringify({ depositId: initiated.depositId, success: true }),
});
if (!wh2.ok || !wh2.alreadyProcessed) {
  fail("Segundo webhook debería ser idempotente", wh2);
}

const walletDup = await jsonFetch<{ wallet: { balanceCents: number } | null }>("/player/wallet", {
  headers: auth,
});
if ((walletDup.wallet?.balanceCents ?? 0) !== balanceAfter) {
  fail("Webhook duplicado alteró el saldo");
}
console.log("   Idempotencia OK");

const wtCount = await prisma.walletTransaction.count({
  where: { depositId: initiated.depositId, type: "DEPOSIT" },
});
if (wtCount !== 1) {
  fail("Debería existir una sola WalletTransaction DEPOSIT", { wtCount });
}

console.log("\n✓ E2E stub + webhook OK");
console.log("  Jugador:", email, "| depositId:", initiated.depositId);

await prisma.$disconnect();
