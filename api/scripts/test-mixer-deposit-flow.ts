/**
 * Prueba flujo MixerGaming método 84 (Payment Test) — ARS / AR.
 * Uso: npx tsx scripts/test-mixer-deposit-flow.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { MixerGamingClient } from "../src/payments/providers/mixer-gaming/client.ts";

const API = process.env.API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:4001";
const METHOD_ID = "84";
const AMOUNT_CENTS = 100_000; // $1.000 ARS

const prisma = new PrismaClient();

function fail(msg: string, detail?: unknown): never {
  console.error("\n✗", msg, detail ?? "");
  process.exit(1);
}

const baseUrl = process.env.PAYMENTS_MIXER_GAMING_BASE_URL?.trim();
const clientId = process.env.PAYMENTS_MIXER_GAMING_CLIENT_ID?.trim();
const clientSecret = process.env.PAYMENTS_MIXER_GAMING_CLIENT_SECRET?.trim();
if (!baseUrl || !clientId || !clientSecret) {
  fail("Faltan PAYMENTS_MIXER_GAMING_* en api/.env");
}

const mixer = new MixerGamingClient({ baseUrl, clientId, clientSecret });

console.log("1) OAuth + listar métodos ARS…");
const methods = await mixer.listPaymentMethods("ARS", 1);
console.log("   Métodos activos:", methods.length);
const method84 = methods.find((m) => String(m.id) === METHOD_ID);
if (!method84) {
  console.log(
    "   IDs disponibles:",
    methods.map((m) => `${m.id} (${m.name})`).join(", ") || "(ninguno)",
  );
  fail(`No se encontró método id ${METHOD_ID}. ¿Está habilitado para client ${clientId}?`);
}
console.log(`   OK: ${method84.id} – ${method84.name} (min ${method84.min}, max ${method84.max})`);

console.log("2) Registrar jugador de prueba…");
const suffix = Date.now().toString(36);
const regRes = await fetch(`${API}/player/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: `mixer84-${suffix}@example.com`,
    username: `mx84_${suffix}`,
    password: "TestPass123!",
  }),
});
if (!regRes.ok) fail("Register falló", await regRes.text());
const reg = (await regRes.json()) as { accessToken: string; player: { id: string } };
const token = reg.accessToken;

console.log("3) Listar métodos vía API…");
const pmRes = await fetch(`${API}/player/deposits/payment-methods`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!pmRes.ok) fail("payment-methods falló", await pmRes.text());
const pm = (await pmRes.json()) as { paymentMethods: { id: string; providerId: string; name: string }[] };
const apiMethod = pm.paymentMethods.find((m) => m.id === METHOD_ID && m.providerId === "mixer-gaming");
if (!apiMethod) {
  console.log(
    "   Métodos API:",
    pm.paymentMethods.map((m) => `${m.providerId}:${m.id} ${m.name}`).join("; "),
  );
  fail("Método 84 no aparece en API. ¿Reiniciaste la API tras cargar .env?");
}
console.log(`   OK en API: ${apiMethod.name}`);

console.log("4) Iniciar depósito (mixer-gaming / método 84)…");
const depRes = await fetch(`${API}/player/deposits`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    amountCents: AMOUNT_CENTS,
    paymentMethodId: METHOD_ID,
    providerId: "mixer-gaming",
    profile: {
      firstName: "Test",
      lastName: "Mixer",
      dni: "30123456",
      phone: "1122334455",
      phoneCode: "54",
      countryCode: "AR",
    },
  }),
});
const depText = await depRes.text();
if (!depRes.ok) fail(`POST /player/deposits HTTP ${depRes.status}`, depText);

const dep = JSON.parse(depText) as {
  depositId: string;
  status: string;
  redirectUrl?: string | null;
  qrCode?: string | null;
  message?: string;
};
console.log("   depositId:", dep.depositId);
console.log("   status:", dep.status);
if (dep.redirectUrl) console.log("   redirectUrl:", dep.redirectUrl);
if (dep.qrCode) console.log("   qrCode:", dep.qrCode);
if (dep.message) console.log("   message:", dep.message);

const row = await prisma.deposit.findUnique({ where: { id: dep.depositId } });
console.log("   DB externalRef:", row?.externalRef ?? "(null)");
console.log("   DB providerId:", row?.providerId);

const walletBefore = await prisma.wallet.findFirst({ where: { playerId: reg.player.id } });
console.log("   Saldo antes webhook:", walletBefore?.balanceCents ?? 0);

console.log("\n✓ Transacción creada. Siguiente paso manual:");
console.log("  - Abrí redirectUrl en el navegador y aprobá/rechazá el pago en Payment Test");
console.log("  - Mixer enviará POST al webhook ngrok");
console.log("  - O simulá webhook local:");
console.log(
  `    POST /webhooks/payments/mixer-gaming body: {"success":true,"transaction":[{"id":${row?.externalRef ?? "TRANSACTION_ID"},"transaction_type":1,"amount":${AMOUNT_CENTS / 100}}]}`,
);

await prisma.$disconnect();
