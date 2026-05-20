/**
 * Prueba end-to-end sin BO: admin JWT + POST /backoffice/players/:id/prize-credits
 * Requiere: API en marcha, DB con al menos un PlayerRoundCard y BingoPrize del mismo bingo.
 * Uso: npx tsx scripts/run-prize-credit-test.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const API = process.env.API_BASE_URL ?? "http://localhost:4001";

const prisma = new PrismaClient();

const card = await prisma.playerRoundCard.findFirst({
  include: { bingoRound: { include: { bingo: true } } },
});
if (!card) {
  console.error("Sin cartones en BD. Comprá con el portal jugador primero.");
  process.exit(1);
}
const prize = await prisma.bingoPrize.findFirst({
  where: { bingoId: card.bingoRound.bingoId },
});
if (!prize) {
  console.error("Sin BingoPrize para el bingo de ese cartón.");
  process.exit(1);
}

const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

const loginRes = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!loginRes.ok) {
  console.error("Login admin falló:", loginRes.status, await loginRes.text());
  process.exit(1);
}
const loginJson = (await loginRes.json()) as { accessToken?: string };
const token = loginJson.accessToken;
if (!token) {
  console.error("Sin accessToken en login");
  process.exit(1);
}

const playerId = card.playerId;
const body = JSON.stringify({
  bingoPrizeId: prize.id,
  playerRoundCardId: card.id,
});

const prizeRes = await fetch(`${API}/backoffice/players/${playerId}/prize-credits`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body,
});

const text = await prizeRes.text();
console.log("HTTP", prizeRes.status, text);

await prisma.$disconnect();

if (!prizeRes.ok) process.exit(1);
