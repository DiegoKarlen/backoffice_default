/**
 * Prueba end-to-end sin BO: admin JWT + POST /backoffice/players/:id/prize-credits
 * Requiere: API en marcha, cartón con victoria registrada por el motor (DeferredRoundPrizeWin).
 *
 * Uso: npx tsx scripts/run-prize-credit-test.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { evaluateRoundPrizesAfterBall } from "../src/game-engine/bingo/bingo-75/prize-evaluator.js";
import { row0DrawnNumbers } from "../tests/helpers/fixtures/card-cells.js";

const API = process.env.API_BASE_URL ?? "http://localhost:4001";

const prisma = new PrismaClient();

const card = await prisma.playerRoundCard.findFirst({
  include: {
    cells: true,
    bingoRound: { include: { bingo: true } },
  },
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

const drawn = row0DrawnNumbers(
  card.cells.map((c) => ({
    row: c.row,
    col: c.col,
    number: c.number,
    isFree: c.isFree,
  })),
);

console.log("Registrando victoria vía motor (evaluateRoundPrizesAfterBall)…");
await evaluateRoundPrizesAfterBall({
  bingoRoundId: card.bingoRoundId,
  bingoId: card.bingoRound.bingoId,
  drawnNumbers: drawn,
});

const deferred = await prisma.deferredRoundPrizeWin.findFirst({
  where: {
    bingoRoundId: card.bingoRoundId,
    playerRoundCardId: card.id,
    bingoPrizeId: prize.id,
  },
});
if (!deferred) {
  console.error(
    "El motor no registró DeferredRoundPrizeWin para este cartón/premio. Ajustá celdas o bolillas sorteadas.",
  );
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

console.log("POST prize-credits (requiere victoria en motor)…");
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

if (!prizeRes.ok) {
  await prisma.$disconnect();
  process.exit(1);
}

console.log("Segundo POST (idempotencia)…");
const prizeRes2 = await fetch(`${API}/backoffice/players/${playerId}/prize-credits`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body,
});
console.log("HTTP", prizeRes2.status, await prizeRes2.text());

await prisma.$disconnect();

if (prizeRes2.status !== 409) process.exit(1);

console.log("\n✓ prize-credit E2E OK");
